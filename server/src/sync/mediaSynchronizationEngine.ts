import type { MediaItem, PlaybackState, PlaybackStatus } from '../types.js';

/**
 * Server-authoritative playback clock.
 *
 * A playback state is an anchor: "at serverTimestamp, the media was at
 * `position` seconds". For playing states a future `scheduledStartTime` is
 * also broadcast so clients can buffer and then all start together.
 */
export class MediaSynchronizationEngine {
  constructor(private readonly scheduleDelayMs: number = 1000) {}

  public createState(
    status: PlaybackStatus,
    position: number,
    track: MediaItem | null,
    playbackRate = 1,
    delayMs = this.scheduleDelayMs
  ): PlaybackState {
    const now = Date.now();
    return {
      status,
      currentTrack: track,
      position: Math.max(0, position),
      serverTimestamp: now,
      scheduledStartTime: status === 'playing' ? now + Math.max(0, delayMs) : null,
      playbackRate,
      version: now,
    };
  }

  /**
   * The canonical position right now. This is what every client compares to.
   */
  public positionAt(state: PlaybackState, now = Date.now()): number {
    if (!state.currentTrack || state.status !== 'playing') {
      return Math.max(0, state.position);
    }

    const start = state.scheduledStartTime ?? state.serverTimestamp;
    if (now < start) return Math.max(0, state.position);

    const elapsed = Math.max(0, now - start) / 1000;
    const position = state.position + elapsed * (state.playbackRate || 1);
    const duration = state.currentTrack.duration;

    if (duration > 0) return Math.min(duration, position);
    return Math.max(0, position);
  }

  /**
   * A compact resync packet. Clients treat `serverTimestamp` as the anchor and
   * only correct when they are actually out of tolerance.
   */
  public snapshot(state: PlaybackState, now = Date.now()): PlaybackState {
    return {
      ...state,
      position: this.positionAt(state, now),
      serverTimestamp: now,
      scheduledStartTime: state.status === 'playing' ? null : null,
      version: state.version,
    };
  }

  public remainingMs(state: PlaybackState, now = Date.now()): number | null {
    if (!state.currentTrack || state.status !== 'playing') return null;
    if (state.currentTrack.duration <= 0) return null;
    return Math.max(0, (state.currentTrack.duration - this.positionAt(state, now)) * 1000);
  }
}
