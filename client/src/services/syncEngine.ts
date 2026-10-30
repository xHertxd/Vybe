import { socket } from './socket.js';
import type { PlaybackState, SyncMetrics } from '../types.js';

export interface PlayerAdapter {
  getCurrentTime(): number;
  seekTo(seconds: number): void;
  setPlaybackRate(rate: number): void;
  play(): Promise<void> | void;
  pause(): void;
  isPlaying(): boolean;
  isReady(): boolean;
}

export class ClientSyncEngine {
  private static instance: ClientSyncEngine;
  private offsetSamples: number[] = [];
  private smoothedOffset: number = 0;
  private lastPingTime: number = 0;
  private currentRtt: number = 20;

  private activeAdapter: PlayerAdapter | null = null;
  private currentState: PlaybackState | null = null;
  private roomCode: string | null = null;

  private syncInterval: any = null;
  private scheduledTimer: any = null;
  private metricsListeners: Set<(metrics: SyncMetrics) => void> = new Set();
  public lastDriftMs: number = 0;
  private currentCorrectionMode: 'none' | 'speed-nudge' | 'hard-seek' | 'buffering' = 'none';

  private constructor() {
    this.initClockSync();
  }

  public static getInstance(): ClientSyncEngine {
    if (!ClientSyncEngine.instance) {
      ClientSyncEngine.instance = new ClientSyncEngine();
    }
    return ClientSyncEngine.instance;
  }

  /**
   * Initializes NTP clock synchronization with server.
   */
  private initClockSync(): void {
    socket.on('sync:pong', (data: { clientTime: number; serverTime: number }) => {
      const t0 = data.clientTime;
      const t1 = data.serverTime;
      const t2 = Date.now();

      const rtt = Math.max(1, t2 - t0);
      this.currentRtt = rtt;

      // Clock offset Δ = serverTime - (clientTime + RTT / 2)
      const offset = t1 - (t0 + rtt / 2);

      this.offsetSamples.push(offset);
      if (this.offsetSamples.length > 8) {
        this.offsetSamples.shift();
      }

      // Sort and take median for noise immunity
      const sorted = [...this.offsetSamples].sort((a, b) => a - b);
      this.smoothedOffset = sorted[Math.floor(sorted.length / 2)];
    });

    // Send initial bursts of pings
    this.pingServer();
    setTimeout(() => this.pingServer(), 200);
    setTimeout(() => this.pingServer(), 500);
    setTimeout(() => this.pingServer(), 1000);

    // Periodic heartbeat clock sync every 4 seconds
    setInterval(() => {
      this.pingServer();
    }, 4000);
  }

  public pingServer(): void {
    if (socket.connected) {
      this.lastPingTime = Date.now();
      socket.emit('sync:ping', { clientTime: this.lastPingTime });
    }
  }

  /**
   * Returns current synchronized virtual server time in milliseconds.
   */
  public getEstimatedServerTime(): number {
    return Date.now() + this.smoothedOffset;
  }

  /**
   * Sets the active audio/video player adapter (HTML5 Audio or YouTube Iframe).
   */
  public setAdapter(adapter: PlayerAdapter | null): void {
    this.activeAdapter = adapter;
    this.evaluateSync();
  }

  /**
   * Binds room code and starts active drift monitoring loop.
   */
  public setRoom(roomCode: string | null): void {
    this.roomCode = roomCode;
    if (roomCode && !this.syncInterval) {
      this.startDriftMonitoring();
    } else if (!roomCode && this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Receives new authoritative playback state from server.
   */
  public onPlaybackSync(state: PlaybackState): void {
    this.currentState = state;

    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }

    if (!this.activeAdapter || !this.activeAdapter.isReady()) {
      return;
    }

    const serverNow = this.getEstimatedServerTime();

    if (state.status === 'paused' || state.status === 'stopped') {
      this.activeAdapter.pause();
      this.activeAdapter.seekTo(state.position);
      this.currentCorrectionMode = 'none';
      this.emitMetrics(0);
      return;
    }

    if (state.status === 'playing') {
      const scheduledTime = state.scheduledStartTime || state.serverTimestamp;
      const delayUntilStart = scheduledTime - serverNow;

      if (delayUntilStart > 10) {
        // Scheduled future start timestamp: prepare player at target position and hold
        this.activeAdapter.pause();
        this.activeAdapter.seekTo(state.position);
        this.currentCorrectionMode = 'buffering';
        this.emitMetrics(0);

        this.scheduledTimer = setTimeout(() => {
          if (this.activeAdapter && this.currentState?.status === 'playing') {
            this.activeAdapter.play();
            this.currentCorrectionMode = 'none';
          }
        }, delayUntilStart);
      } else {
        // Scheduled timestamp already passed (or client joined mid-song):
        // Calculate authoritative target position and immediately align!
        const elapsed = Math.max(0, (serverNow - scheduledTime) / 1000);
        const targetPos = state.position + elapsed * (state.playbackRate || 1.0);

        this.activeAdapter.seekTo(targetPos);
        this.activeAdapter.play();
        this.currentCorrectionMode = 'none';
      }
    }
  }

  /**
   * Computes the authoritative playback position at this exact instant.
   */
  public getAuthoritativePosition(): number {
    if (!this.currentState || !this.currentState.currentTrack) return 0;
    if (this.currentState.status !== 'playing') {
      return this.currentState.position;
    }

    const serverNow = this.getEstimatedServerTime();
    const scheduledTime = this.currentState.scheduledStartTime || this.currentState.serverTimestamp;

    if (serverNow < scheduledTime) {
      return this.currentState.position;
    }

    const elapsed = Math.max(0, (serverNow - scheduledTime) / 1000);
    const target = this.currentState.position + elapsed * (this.currentState.playbackRate || 1.0);
    const duration = this.currentState.currentTrack.duration;

    if (duration > 0 && target >= duration) {
      return duration;
    }
    return target;
  }

  /**
   * Periodic drift detection and correction engine.
   */
  private startDriftMonitoring(): void {
    if (this.syncInterval) clearInterval(this.syncInterval);

    this.syncInterval = setInterval(() => {
      this.evaluateSync();
    }, 450);
  }

  private evaluateSync(): void {
    if (!this.activeAdapter || !this.activeAdapter.isReady() || !this.currentState) {
      return;
    }

    if (this.currentState.status !== 'playing') {
      this.activeAdapter.setPlaybackRate(1.0);
      this.currentCorrectionMode = 'none';
      this.emitMetrics(0);
      return;
    }

    const serverNow = this.getEstimatedServerTime();
    const scheduledTime = this.currentState.scheduledStartTime || this.currentState.serverTimestamp;

    // If waiting for scheduled start, do not correct yet
    if (serverNow < scheduledTime) {
      return;
    }

    // Ensure client player is currently playing
    if (!this.activeAdapter.isPlaying()) {
      this.activeAdapter.play();
    }

    const clientCurrentTime = this.activeAdapter.getCurrentTime();
    const targetAuthoritativeTime = this.getAuthoritativePosition();
    const driftSeconds = clientCurrentTime - targetAuthoritativeTime;
    const driftMs = Math.round(driftSeconds * 1000);
    this.lastDriftMs = driftMs;

    // Drift correction logic
    const absDrift = Math.abs(driftSeconds);

    if (absDrift > 0.35) {
      // Significant drift (> 350ms): hard seek to target position
      this.currentCorrectionMode = 'hard-seek';
      this.activeAdapter.seekTo(targetAuthoritativeTime);
      this.activeAdapter.setPlaybackRate(1.0);
    } else if (absDrift > 0.04) {
      // Moderate drift (40ms - 350ms): smooth phase-locked nudge
      this.currentCorrectionMode = 'speed-nudge';
      if (driftSeconds < 0) {
        // Client is lagging behind authoritative time: speed up slightly
        this.activeAdapter.setPlaybackRate(1.03);
      } else {
        // Client is slightly ahead: slow down slightly
        this.activeAdapter.setPlaybackRate(0.97);
      }
    } else {
      // In tight synchronization (< 40ms drift): keep standard rate
      this.currentCorrectionMode = 'none';
      this.activeAdapter.setPlaybackRate(1.0);
    }

    this.emitMetrics(driftMs);

    // Report metrics back to server every few ticks
    if (this.roomCode && Math.random() < 0.25) {
      socket.emit('playback:drift_report', {
        roomCode: this.roomCode,
        drift: Math.abs(driftMs),
        ping: Math.round(this.currentRtt / 2)
      });
    }
  }

  public subscribeMetrics(listener: (metrics: SyncMetrics) => void): () => void {
    this.metricsListeners.add(listener);
    return () => this.metricsListeners.delete(listener);
  }

  private emitMetrics(driftMs: number): void {
    const metrics: SyncMetrics = {
      ping: Math.round(this.currentRtt / 2),
      clockOffset: Math.round(this.smoothedOffset),
      drift: Math.abs(driftMs),
      inSync: Math.abs(driftMs) < 60,
      correctionMode: this.currentCorrectionMode
    };

    for (const listener of this.metricsListeners) {
      listener(metrics);
    }
  }
}

export const syncEngine = ClientSyncEngine.getInstance();
