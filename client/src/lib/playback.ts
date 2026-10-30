import type { PlaybackState } from '../types.js';

/**
 * The position the server considers authoritative at `serverNow`.
 * Mirrors the server's MediaSynchronizationEngine exactly.
 */
export function positionAt(playback: PlaybackState, serverNow: number): number {
  if (!playback.currentTrack) return 0;
  if (playback.status !== 'playing') return Math.max(0, playback.position);

  const anchor = playback.scheduledStartTime ?? playback.serverTimestamp;
  if (serverNow < anchor) return Math.max(0, playback.position);

  const elapsed = Math.max(0, serverNow - anchor) / 1000;
  const position = playback.position + elapsed * (playback.playbackRate || 1);
  const duration = playback.currentTrack.duration;

  if (duration > 0) return Math.min(duration, position);
  return Math.max(0, position);
}

/** Milliseconds until the scheduled start, or 0 when already started. */
export function waitUntilStart(playback: PlaybackState, serverNow: number): number {
  if (playback.status !== 'playing') return 0;
  const anchor = playback.scheduledStartTime ?? playback.serverTimestamp;
  return Math.max(0, anchor - serverNow);
}
