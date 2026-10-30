export type MediaProvider = 'youtube' | 'spotify' | 'audio';

export type MediaSourceType =
  | 'video'
  | 'shorts'
  | 'playlist'
  | 'track'
  | 'album'
  | 'upload'
  | 'url';

export interface MediaItemInput {
  provider: MediaProvider;
  sourceType?: MediaSourceType;
  mediaId: string;
  url: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  album?: string;
  isPlayable: boolean;
  unavailabilityReason?: string;
}

export interface MediaItem extends MediaItemInput {
  id: string;
  addedBy: string;
  addedAt: number;
}

export type PlaybackStatus = 'playing' | 'paused' | 'stopped';

export interface PlaybackState {
  status: PlaybackStatus;
  currentTrack: MediaItem | null;
  position: number;
  serverTimestamp: number;
  scheduledStartTime: number | null;
  playbackRate: number;
  version: number;
}

export interface RoomUser {
  id: string;
  username: string;
  isAdmin: boolean;
  isOnline: boolean;
  ping: number;
  drift: number;
}

export interface RoomSettings {
  repeatMode: 'off' | 'all' | 'one';
  isShuffle: boolean;
  sharedVolume: number;
  playbackControl?: 'admin' | 'anyone';
  crossfade?: number;
  automix?: boolean;
}

export interface RoomState {
  roomCode: string;
  adminId: string;
  createdAt: number;
  playback: PlaybackState;
  queue: MediaItem[];
  currentIndex: number;
  users: RoomUser[];
  settings: RoomSettings;
  version: number;
}

export interface ResolvedMedia {
  provider: MediaProvider;
  sourceType: MediaSourceType;
  title: string;
  artist: string;
  thumbnail: string;
  items: MediaItemInput[];
  warning?: string;
}

export interface SyncMetrics {
  ping: number;
  clockOffset: number;
  drift: number;
  inSync: boolean;
  correctionMode: 'none' | 'nudge' | 'seek' | 'buffering';
}

export interface StoredSession {
  roomCode: string;
  userId: string;
  sessionToken: string;
  username: string;
}

export interface MediaCapabilities {
  youtubePlaylists: boolean;
  spotifyMetadata: boolean;
  youtubeApi: boolean;
}

export interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  tone: 'info' | 'success' | 'error';
}
