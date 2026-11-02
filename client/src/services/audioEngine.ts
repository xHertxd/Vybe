import type { Track, PlaybackState } from '../types.js';

type DriftListener = (driftMs: number) => void;
type StateListener = (isPlaying: boolean, currentTime: number, duration: number) => void;

class SynchronizedAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private audioEl: HTMLAudioElement | null = null;

  private currentTrackId: string | null = null;
  private isLocallyPlaying = false;
  private lastSeekTimestamp = 0;
  private lastPlaybackState: PlaybackState | null = null;

  // External clock offset provider (from roomCoordinator peer sync)
  private getReferenceNow: () => number = () => Date.now();

  private driftMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private driftListeners = new Set<DriftListener>();
  private stateListeners = new Set<StateListener>();
  private onTrackEndedCallback: (() => void) | null = null;

  constructor() {
    this.setupAudioElement();
  }

  public setClockProvider(provider: () => number): void {
    this.getReferenceNow = provider;
  }

  private setupAudioElement(): void {
    if (typeof window === 'undefined') return;

    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';

    audio.onplay = () => {
      this.isLocallyPlaying = true;
      this.notifyState();
    };

    audio.onpause = () => {
      this.isLocallyPlaying = false;
      this.notifyState();
    };

    audio.onended = () => {
      this.isLocallyPlaying = false;
      this.notifyState();
      this.onTrackEndedCallback?.();
    };

    audio.ontimeupdate = () => {
      this.notifyState();
    };

    audio.onerror = () => {
      console.warn('[AudioEngine] Audio element load issue, falling back without crossOrigin');
      if (audio.crossOrigin) {
        audio.crossOrigin = null;
        if (this.lastPlaybackState?.currentTrack?.url) {
          audio.src = this.lastPlaybackState.currentTrack.url;
          audio.load();
          if (this.lastPlaybackState.status === 'playing') {
            void audio.play().catch(() => {});
          }
        }
      }
    };

    this.audioEl = audio;

    // Global interaction listener: first touch/click/key automatically unlocks audio
    const unlockOnInteraction = async () => {
      window.removeEventListener('click', unlockOnInteraction);
      window.removeEventListener('keydown', unlockOnInteraction);
      window.removeEventListener('touchstart', unlockOnInteraction);
      await this.unlock();
      if (this.lastPlaybackState && this.lastPlaybackState.status === 'playing' && this.audioEl && this.audioEl.paused) {
        void this.syncPlayback(this.lastPlaybackState);
      }
    };
    window.addEventListener('click', unlockOnInteraction, { passive: true });
    window.addEventListener('keydown', unlockOnInteraction, { passive: true });
    window.addEventListener('touchstart', unlockOnInteraction, { passive: true });
  }

  public getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.8;

      if (this.audioEl) {
        try {
          this.mediaSourceNode = this.ctx.createMediaElementSource(this.audioEl);
          this.mediaSourceNode.connect(this.analyser);
          this.analyser.connect(this.masterGain);
          this.masterGain.connect(this.ctx.destination);
        } catch (e) {
          console.warn('[AudioEngine] MediaElementSource warning:', e);
        }
      }
    }
    return this.ctx;
  }

  public async unlock(): Promise<boolean> {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {}
    }
    return ctx.state === 'running';
  }

  public isUnlocked(): boolean {
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    if (this.audioEl) {
      this.audioEl.volume = clamped;
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(clamped, this.ctx.currentTime);
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

  public getCurrentPosition(): number {
    return this.audioEl ? this.audioEl.currentTime : 0;
  }

  public getDuration(): number {
    return this.audioEl && !isNaN(this.audioEl.duration) ? this.audioEl.duration : 0;
  }

  /**
   * Applies authoritative synchronized playback state across all devices.
   */
  public async syncPlayback(playback: PlaybackState): Promise<void> {
    this.lastPlaybackState = playback;
    if (!this.audioEl) return;

    if (!playback.currentTrack || playback.status !== 'playing') {
      this.pause();
      if (playback.position !== undefined && Math.abs(this.audioEl.currentTime - playback.position) > 0.5) {
        this.audioEl.currentTime = playback.position;
      }
      return;
    }

    const track = playback.currentTrack;
    const isNewTrack = this.currentTrackId !== track.id || this.audioEl.src !== track.url;

    if (isNewTrack) {
      this.currentTrackId = track.id;
      this.audioEl.src = track.url;
      this.audioEl.load();
    }

    // Compute target position from synchronized reference timeline
    const refNow = this.getReferenceNow();
    let waitMs = 0;
    let targetOffset = playback.position;

    if (playback.scheduledStartTime && playback.scheduledStartTime > refNow) {
      waitMs = playback.scheduledStartTime - refNow;
    } else {
      const anchor = playback.scheduledStartTime ?? playback.serverTimestamp;
      const elapsed = Math.max(0, refNow - anchor) / 1000;
      targetOffset = playback.position + elapsed * (playback.playbackRate || 1.0);
    }

    // Seek if noticeably out of sync
    const currentAudioTime = this.audioEl.currentTime;
    if (isNewTrack || Math.abs(currentAudioTime - targetOffset) > 0.35) {
      try {
        this.audioEl.currentTime = Math.max(0, targetOffset);
        this.lastSeekTimestamp = Date.now();
      } catch {}
    }

    // Schedule play
    const executePlay = async () => {
      try {
        await this.unlock();
        if (this.audioEl && playback.status === 'playing') {
          this.audioEl.playbackRate = 1.0;
          await this.audioEl.play();
          this.startDriftMonitor();
        }
      } catch (err) {
        console.warn('[AudioEngine] Playback was prevented (needs user interaction):', err);
      }
    };

    if (waitMs > 10) {
      setTimeout(() => {
        void executePlay();
      }, waitMs);
    } else {
      void executePlay();
    }
  }

  public pause(): void {
    if (this.audioEl) {
      this.audioEl.pause();
    }
    this.stopDriftMonitor();
    this.isLocallyPlaying = false;
    this.notifyState();
  }

  public stop(): void {
    this.pause();
    if (this.audioEl) {
      this.audioEl.currentTime = 0;
    }
  }

  /**
   * Phase-Locked Loop (PLL) micro-adjustments:
   * Keeps audio strictly aligned across devices using smooth rate micro-adjustments
   * without any restart loops or audio stutter!
   */
  private startDriftMonitor(): void {
    this.stopDriftMonitor();

    this.driftMonitorTimer = setInterval(() => {
      if (!this.audioEl || this.audioEl.paused || !this.lastPlaybackState || this.lastPlaybackState.status !== 'playing') {
        return;
      }

      const refNow = this.getReferenceNow();
      const playback = this.lastPlaybackState;
      const anchor = playback.scheduledStartTime ?? playback.serverTimestamp;
      if (refNow < anchor) return;

      const elapsedSec = (refNow - anchor) / 1000;
      const expectedPos = playback.position + elapsedSec * (playback.playbackRate || 1.0);
      const actualPos = this.audioEl.currentTime;

      const driftSec = actualPos - expectedPos;
      const driftMs = Math.round(driftSec * 1000);

      this.driftListeners.forEach((fn) => fn(driftMs));
      this.notifyState();

      const absDriftMs = Math.abs(driftMs);

      // Smooth micro-tuning: never restart the track!
      if (absDriftMs <= 15) {
        // Locked in sync
        this.audioEl.playbackRate = 1.0;
      } else if (absDriftMs <= 300) {
        // Inaudible micro-adjustment: 0.5% rate change
        if (driftMs > 0) {
          this.audioEl.playbackRate = 0.992; // Slightly ahead -> slow down
        } else {
          this.audioEl.playbackRate = 1.008; // Slightly behind -> speed up
        }
      } else if (absDriftMs > 1500 && Date.now() - this.lastSeekTimestamp > 3000) {
        // Only hard seek if massive desync (> 1.5s) and not recently seeked
        this.audioEl.currentTime = expectedPos;
        this.audioEl.playbackRate = 1.0;
        this.lastSeekTimestamp = Date.now();
      }
    }, 500);
  }

  private stopDriftMonitor(): void {
    if (this.driftMonitorTimer) {
      clearInterval(this.driftMonitorTimer);
      this.driftMonitorTimer = null;
    }
  }

  private notifyState(): void {
    const pos = this.getCurrentPosition();
    const dur = this.getDuration();
    this.stateListeners.forEach((fn) => fn(this.isLocallyPlaying, pos, dur));
  }
}

export const audioEngine = new SynchronizedAudioEngine();
