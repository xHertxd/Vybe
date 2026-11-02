export type TrackSource = 'freetouse' | 'upload' | 'url';

export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  duration: number; // in seconds
  coverUrl?: string;
  source: TrackSource;
}

export type PlaybackStatus = 'playing' | 'paused' | 'stopped';

export interface PlaybackState {
  status: PlaybackStatus;
  currentTrack: Track | null;
  position: number; // position in seconds at serverTimestamp
  serverTimestamp: number; // server timestamp ms when this state was created
  scheduledStartTime: number | null; // future server timestamp ms when playback begins
  playbackRate: number; // default 1.0
}

export interface Participant {
  id: string;
  username: string;
  isHost: boolean;
  driftMs: number;
  joinedAt: number;
}

export interface RoomState {
  code: string;
  hostId: string;
  playback: PlaybackState;
  queue: Track[];
  queueIndex: number;
  participants: Participant[];
}

// Socket Communication Payloads
export interface SyncPingPayload {
  clientTime: number;
}

export interface SyncPongPayload {
  clientTime: number;
  serverTime: number;
}

export interface JoinRoomPayload {
  roomCode: string;
  username: string;
}

export interface DriftReportPayload {
  roomCode: string;
  driftMs: number;
}

export interface PlaybackControlPayload {
  roomCode: string;
  position?: number;
}

export interface QueueAddPayload {
  roomCode: string;
  track: Track;
}

export interface QueueRemovePayload {
  roomCode: string;
  trackId: string;
}

export interface QueueSkipPayload {
  roomCode: string;
  index?: number;
}

