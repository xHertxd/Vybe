import { PlaybackState } from '../types.js';

export class SyncEngine {
  // Configurable scheduling delay for synchronized action start
  public static readonly SCHEDULED_DELAY_MS = 250;

  /**
   * Returns current high-precision server time in milliseconds.
   */
  public static getServerTime(): number {
    return Date.now();
  }

  /**
   * Calculates the exact authoritative playback position in seconds
   * based on the state and current server timestamp.
   */
  public static calculateAuthoritativePosition(state: PlaybackState): number {
    if (!state.currentTrack) return 0;
    if (state.status !== 'playing') {
      return state.position;
    }

    const now = this.getServerTime();

    // If a future start timestamp was scheduled and has not arrived yet:
    if (state.scheduledStartTime && now < state.scheduledStartTime) {
      return state.position;
    }

    // Playback is active: compute elapsed time from scheduled start or server timestamp
    const referenceTime = state.scheduledStartTime || state.serverTimestamp;
    const elapsedSeconds = Math.max(0, (now - referenceTime) / 1000);
    const computedPosition = state.position + (elapsedSeconds * (state.playbackRate || 1.0));

    // Clamp to track duration if known
    if (state.currentTrack.duration > 0 && computedPosition >= state.currentTrack.duration) {
      return state.currentTrack.duration;
    }

    return Math.max(0, computedPosition);
  }

  /**
   * Creates a new scheduled playback state for play/seek/next actions.
   */
  public static createScheduledState(
    status: 'playing' | 'paused' | 'stopped',
    position: number,
    currentTrack: any,
    playbackRate: number = 1.0,
    delayMs: number = this.SCHEDULED_DELAY_MS
  ): PlaybackState {
    const now = this.getServerTime();
    return {
      status,
      currentTrack,
      position,
      serverTimestamp: now,
      scheduledStartTime: status === 'playing' ? now + delayMs : null,
      playbackRate
    };
  }
}

