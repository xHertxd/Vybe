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
  /** Position in seconds at serverTimestamp. */
  position: number;
  /** Server epoch milliseconds at which `position` was sampled. */
  serverTimestamp: number;
  /** Epoch ms in the future when every client should start playback. */
  scheduledStartTime: number | null;
  playbackRate: number;
  /** Increments with every authoritative mutation. */
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

export interface RoomMember extends RoomUser {
  socketId: string;
  connectedAt: number;
  /** Kept server-side only; proves ownership of a participant id on reconnect. */
  sessionToken: string;
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

export interface ResolveMediaResponse {
  success: boolean;
  data?: ResolvedMedia;
  error?: string;
}
