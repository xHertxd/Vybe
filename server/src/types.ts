export type MediaProvider = 'youtube' | 'spotify' | 'direct' | 'upload';

export interface UnifiedMediaItem {
  id: string;
  provider: MediaProvider;
  mediaId: string;
  url: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number; // in seconds
  isPlayable: boolean;
  unavailabilityReason?: string;
  addedBy: string;
  addedAt: number;
  album?: string;
}

export type PlaybackStatus = 'playing' | 'paused' | 'stopped';

export interface PlaybackState {
  status: PlaybackStatus;
  currentTrack: UnifiedMediaItem | null;
  position: number; // seconds at serverTimestamp
  serverTimestamp: number; // ms high-res epoch
  scheduledStartTime: number | null; // ms future epoch when clients start together
  playbackRate: number;
}

export interface RoomUser {
  id: string; // persistent participant uuid
  socketId: string;
  username: string; // alphabetic only
  isAdmin: boolean;
  isOnline: boolean;
  lastSeen: number;
  ping: number;
  drift: number;
}

export interface RoomSettings {
  repeatMode: 'off' | 'all' | 'one';
  isShuffle: boolean;
  sharedVolume: number;
}

export interface RoomState {
  roomCode: string;
  adminId: string;
  createdAt: number;
  playback: PlaybackState;
  queue: UnifiedMediaItem[];
  currentIndex: number;
  users: RoomUser[];
  settings: RoomSettings;
}
