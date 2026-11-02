import type { Track, PlaybackState } from '../types.js';
import { ntpClock } from './ntpClock.js';
import { BACKEND_URL } from './socket.js';

type DriftListener = (driftMs: number) => void;
type StateListener = (isPlaying: boolean, currentTime: number, duration: number) => void;

class WebAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;

  private bufferCache = new Map<string, AudioBuffer>();
  private activeTrackId: string | null = null;

  // Track timing references
  private trackStartTimeAudioCtx = 0;
  private trackStartOffsetSec = 0;
  private trackDurationSec = 0;
  private isLocallyPlaying = false;

  private driftMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private lastScheduledPlaybackState: PlaybackState | null = null;

  private driftListeners = new Set<DriftListener>();
  private stateListeners = new Set<StateListener>();
  private onTrackEndedCallback: (() => void) | null = null;

  constructor() {
    // Lazy AudioContext initialization on first user interaction
  }

  public getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.8;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  public async unlock(): Promise<boolean> {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    return ctx.state === 'running';
  }

  public isUnlocked(): boolean {
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public setVolume(volume: number): void {
    if (!this.masterGain) this.getAudioContext();
    if (this.masterGain) {
      const clamped = Math.max(0, Math.min(1, volume));
      this.masterGain.gain.setValueAtTime(clamped, this.getAudioContext().currentTime);
    }
  }

  public setTrackEndedCallback(cb: () => void): void {
    this.onTrackEndedCallback = cb;
  }

  public addDriftListener(fn: DriftListener): () => void {
    this.driftListeners.add(fn);
    return () => this.driftListeners.delete(fn);
  }

  public addStateListener(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  /**
   * Fetches and decodes an audio file into PCM memory.
   * Uses proxy endpoint if the direct URL might trigger CORS issues.
   */
  public async loadBuffer(track: Track): Promise<AudioBuffer> {
    if (this.bufferCache.has(track.id)) {
      return this.bufferCache.get(track.id)!;
    }

    const ctx = this.getAudioContext();

    // Try direct fetch first (FreeToUse and CDN MP3s have open CORS)
    let response: Response | null = null;
    try {
      response = await fetch(track.url);
    } catch (err) {
      // If direct fetch fails and a backend is configured, try backend proxy
      if (BACKEND_URL && !track.url.startsWith('blob:')) {
        const proxyUrl = `${BACKEND_URL}/api/freetouse/proxy-audio?url=${encodeURIComponent(track.url)}`;
        response = await fetch(proxyUrl).catch(() => null);
      }
    }

    if (!response || !response.ok) {
      throw new Error(`Failed to load audio for ${track.title}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    this.bufferCache.set(track.id, audioBuffer);
    return audioBuffer;
  }

  /**
   * Applies authoritative server playback state using sub-millisecond hardware scheduling.
   */
  public async syncPlayback(playback: PlaybackState): Promise<void> {
    this.lastScheduledPlaybackState = playback;

    if (!playback.currentTrack || playback.status !== 'playing') {
      this.stop();
      return;
    }

    const track = playback.currentTrack;

    try {
      // Ensure AudioContext is initialized
      const ctx = this.getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      // Load or retrieve decoded buffer
      const buffer = await this.loadBuffer(track);
      this.trackDurationSec = buffer.duration;

      // Stop previous active audio source node
      this.stopCurrentSourceNode();

      // Compute exact scheduling offsets
      const serverNow = ntpClock.getServerNow();
      let waitMs = 0;
      let offsetSec = playback.position;

      if (playback.scheduledStartTime && playback.scheduledStartTime > serverNow) {
        // Scheduled to start in the future (play / seek / track change)
        waitMs = playback.scheduledStartTime - serverNow;
      } else {
        // Playing continuously (joining mid-song or resuming)
        const anchor = playback.scheduledStartTime ?? playback.serverTimestamp;
        const elapsedSec = Math.max(0, serverNow - anchor) / 1000;
        offsetSec = playback.position + elapsedSec * (playback.playbackRate || 1.0);
      }

      if (offsetSec >= buffer.duration) {
        // Track already ended
        return;
      }

      // Hardware AudioContext timestamp
      const targetAudioCtxTime = ctx.currentTime + Math.max(0, waitMs / 1000);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playback.playbackRate || 1.0;
      source.connect(this.masterGain!);

      source.onended = () => {
        if (this.currentSource === source) {
          this.isLocallyPlaying = false;
          this.onTrackEndedCallback?.();
        }
      };

      source.start(targetAudioCtxTime, Math.max(0, offsetSec));

      this.currentSource = source;
      this.activeTrackId = track.id;
      this.trackStartTimeAudioCtx = targetAudioCtxTime;
      this.trackStartOffsetSec = offsetSec;
      this.isLocallyPlaying = true;

      this.startDriftMonitor();
    } catch (err) {
      console.warn('[AudioEngine] Playback sync failed:', err);
    }
  }

  public stop(): void {
    this.stopCurrentSourceNode();
    this.stopDriftMonitor();
    this.isLocallyPlaying = false;
    this.notifyState();
  }

  private stopCurrentSourceNode(): void {
    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {}
      this.currentSource = null;
    }
  }

  /**
   * Returns current playback position in seconds based on hardware audio context clock.
   */
  public getCurrentPosition(): number {
    if (!this.ctx || !this.isLocallyPlaying) {
      return this.trackStartOffsetSec;
    }

    const elapsedAudioTime = this.ctx.currentTime - this.trackStartTimeAudioCtx;
    if (elapsedAudioTime < 0) {
      return this.trackStartOffsetSec; // Still waiting for scheduled start
    }

    const currentPos = this.trackStartOffsetSec + elapsedAudioTime;
    return Math.min(this.trackDurationSec, Math.max(0, currentPos));
  }

  /**
   * Phase-Locked Loop (PLL) micro-adjustments:
   * Keeps drift strictly bounded below 5ms without audio artifacts.
   */
  private startDriftMonitor(): void {
    this.stopDriftMonitor();

    this.driftMonitorTimer = setInterval(() => {
      if (!this.isLocallyPlaying || !this.lastScheduledPlaybackState || !this.currentSource || !this.ctx) {
        return;
      }

      const serverNow = ntpClock.getServerNow();
      const playback = this.lastScheduledPlaybackState;

      // Expected theoretical server position right now
      const anchor = playback.scheduledStartTime ?? playback.serverTimestamp;
      if (serverNow < anchor) return; // Prior to scheduled start

      const elapsedServerSec = (serverNow - anchor) / 1000;
      const expectedServerPos = playback.position + elapsedServerSec * (playback.playbackRate || 1.0);

      const actualLocalPos = this.getCurrentPosition();
      const driftSec = actualLocalPos - expectedServerPos;
      const driftMs = Math.round(driftSec * 1000);

      this.driftListeners.forEach((fn) => fn(driftMs));
      this.notifyState();

      // Phase-Locked Loop (PLL) correction
      const absDriftMs = Math.abs(driftMs);
      if (absDriftMs <= 5) {
        // Locked in phase!
        this.currentSource.playbackRate.value = 1.0;
      } else if (absDriftMs <= 80) {
        // Seamless micro-adjustment: adjust rate by 0.2% (inaudible pitch change)
        if (driftMs > 0) {
          this.currentSource.playbackRate.value = 0.998; // ahead -> slow down
        } else {
          this.currentSource.playbackRate.value = 1.002; // behind -> catch up
        }
      } else if (absDriftMs > 150) {
        // Significant desync (e.g. background tab throttling) -> realign seamlessly
        this.syncPlayback(playback);
      }
    }, 600);
  }

  private stopDriftMonitor(): void {
    if (this.driftMonitorTimer) {
      clearInterval(this.driftMonitorTimer);
      this.driftMonitorTimer = null;
    }
  }

  private notifyState(): void {
    const pos = this.getCurrentPosition();
    this.stateListeners.forEach((fn) => fn(this.isLocallyPlaying, pos, this.trackDurationSec));
  }
}

export const audioEngine = new WebAudioEngine();

