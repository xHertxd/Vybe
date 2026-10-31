// Shared Zod schemas for WebSocket messages
// Single source of truth for client-server communication

import { z } from 'zod';
import { AUDIO_CONSTANTS } from '../constants';

// ============================================================================
// Basic Types
// ============================================================================

export const PositionSchema = z.object({
  x: z.number().min(0).max(AUDIO_CONSTANTS.SPATIAL_GRID_SIZE),
  y: z.number().min(0).max(AUDIO_CONSTANTS.SPATIAL_GRID_SIZE),
});
export type PositionType = z.infer<typeof PositionSchema>;

export const MediaProviderSchema = z.enum(['youtube', 'spotify', 'audio']);
export type MediaProvider = z.infer<typeof MediaProviderSchema>;

export const MediaSourceTypeSchema = z.enum([
  'video',
  'shorts',
  'playlist',
  'track',
  'album',
  'upload',
  'url',
]);
export type MediaSourceType = z.infer<typeof MediaSourceTypeSchema>;

export const PlaybackStatusSchema = z.enum(['playing', 'paused', 'stopped']);
export type PlaybackStatus = z.infer<typeof PlaybackStatusSchema>;

export const RepeatModeSchema = z.enum(['off', 'all', 'one']);
export type RepeatMode = z.infer<typeof RepeatModeSchema>;

// ============================================================================
// Media Item Types
// ============================================================================

export const MediaItemInputSchema = z.object({
  provider: MediaProviderSchema,
  sourceType: MediaSourceTypeSchema.optional(),
  mediaId: z.string(),
  url: z.string().url(),
  title: z.string(),
  artist: z.string(),
  thumbnail: z.string().url().optional().default(''),
  duration: z.number().nonnegative().default(0),
  album: z.string().optional(),
  isPlayable: z.boolean().default(true),
  unavailabilityReason: z.string().optional(),
});
export type MediaItemInput = z.infer<typeof MediaItemInputSchema>;

export const MediaItemSchema = MediaItemInputSchema.extend({
  id: z.string(),
  addedBy: z.string(),
  addedAt: z.number(),
});
export type MediaItem = z.infer<typeof MediaItemSchema>;

// ============================================================================
// Playback State
// ============================================================================

export const PlaybackStateSchema = z.object({
  status: PlaybackStatusSchema,
  currentTrack: MediaItemSchema.nullable(),
  position: z.number().default(0), // Position in seconds at serverTimestamp
  serverTimestamp: z.number(), // Server epoch ms when position was sampled
  scheduledStartTime: z.number().nullable(), // Future epoch ms when playback should start
  playbackRate: z.number().default(1),
  version: z.number(), // Monotonic increment for authoritative mutations
});
export type PlaybackState = z.infer<typeof PlaybackStateSchema>;

// ============================================================================
// Room Types
// ============================================================================

export const RoomUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  isAdmin: z.boolean().default(false),
  isOnline: z.boolean().default(true),
  ping: z.number().nonnegative().default(0),
  drift: z.number().default(0), // Legacy - use compensationMs
  compensationMs: z.number().default(0), // outputLatency + nudgeOffset
  nudgeOffsetMs: z.number().default(0), // Manual timing nudge
  rtt: z.number().nonnegative().default(0), // Round-trip time
  lastSeenAt: z.number().default(0),
  joinedAt: z.number().default(0),
});
export type RoomUser = z.infer<typeof RoomUserSchema>;

export const RoomSettingsSchema = z.object({
  repeatMode: RepeatModeSchema.default('off'),
  isShuffle: z.boolean().default(false),
  sharedVolume: z.number().min(0).max(1).default(1),
  crossfadeMs: z.number().nonnegative().default(0),
  automix: z.boolean().default(false),
  // Spatial audio settings
  spatialEnabled: z.boolean().default(false),
  listeningSource: PositionSchema.optional(),
  deviceGains: z.record(z.string(), z.object({
    gain: z.number().min(0).max(1),
    rampTime: z.number().nonnegative().default(0.1),
  })).default({}),
  // Low-pass filter
  lowPassFreq: z.number()
    .min(AUDIO_CONSTANTS.LOW_PASS_MIN_FREQ)
    .max(AUDIO_CONSTANTS.LOW_PASS_MAX_FREQ)
    .optional(),
  lowPassRampTime: z.number().nonnegative().default(0.1),
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const RoomStateSchema = z.object({
  roomCode: z.string().length(6),
  adminId: z.string(),
  createdAt: z.number(),
  playback: PlaybackStateSchema,
  queue: z.array(MediaItemSchema),
  currentIndex: z.number().default(0),
  users: z.array(RoomUserSchema),
  settings: RoomSettingsSchema,
  version: z.number(),
});
export type RoomState = z.infer<typeof RoomStateSchema>;

// ============================================================================
// Resolved Media (for /api/resolve-media)
// ============================================================================

export const ResolvedMediaSchema = z.object({
  provider: MediaProviderSchema,
  sourceType: MediaSourceTypeSchema,
  title: z.string(),
  artist: z.string(),
  thumbnail: z.string(),
  items: z.array(MediaItemInputSchema),
  warning: z.string().optional(),
});
export type ResolvedMedia = z.infer<typeof ResolvedMediaSchema>;

export const ResolveMediaResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: ResolvedMediaSchema,
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);
export type ResolveMediaResponse = z.infer<typeof ResolveMediaResponseSchema>;

// ============================================================================
// Client -> Server Messages (WSRequest)
// ============================================================================

export const NTPRequestSchema = z.object({
  type: z.literal('NTP_REQUEST'),
  clientTime: z.number(),
  probeId: z.number(), // For coded probe pairs
});
export type NTPRequest = z.infer<typeof NTPRequestSchema>;

export const NTPProbePairSchema = z.object({
  type: z.literal('NTP_PROBE_PAIR'),
  probeA: z.number(), // Departure time of probe A
  probeB: z.number(), // Departure time of probe B (probeA + PROBE_GAP_MS)
  clientTime: z.number(),
});
export type NTPProbePair = z.infer<typeof NTPProbePairSchema>;

export const RoomCreateSchema = z.object({
  type: z.literal('ROOM_CREATE'),
  username: z.string().min(2).max(20).regex(/^[A-Za-z]+$/),
  userId: z.string().optional(),
});
export type RoomCreate = z.infer<typeof RoomCreateSchema>;

export const RoomJoinSchema = z.object({
  type: z.literal('ROOM_JOIN'),
  roomCode: z.string().length(6),
  username: z.string().min(2).max(20).regex(/^[A-Za-z]+$/),
  userId: z.string().optional(),
  sessionToken: z.string().optional(),
});
export type RoomJoin = z.infer<typeof RoomJoinSchema>;

export const RoomResumeSchema = z.object({
  type: z.literal('ROOM_RESUME'),
  roomCode: z.string().length(6),
  userId: z.string(),
  sessionToken: z.string(),
  username: z.string().optional(),
});
export type RoomResume = z.infer<typeof RoomResumeSchema>;

export const RoomLeaveSchema = z.object({
  type: z.literal('ROOM_LEAVE'),
  roomCode: z.string().length(6).optional(),
});
export type RoomLeave = z.infer<typeof RoomLeaveSchema>;

export const RoomEndSchema = z.object({
  type: z.literal('ROOM_END'),
  roomCode: z.string().length(6).optional(),
});
export type RoomEnd = z.infer<typeof RoomEndSchema>;

// Playback actions (scheduled)
export const PlayActionSchema = z.object({
  type: z.literal('PLAY'),
  roomCode: z.string().length(6),
  serverTimeToExecute: z.number(), // Server epoch ms when all clients should start
});
export type PlayAction = z.infer<typeof PlayActionSchema>;

export const PauseActionSchema = z.object({
  type: z.literal('PAUSE'),
  roomCode: z.string().length(6),
  serverTimeToExecute: z.number(),
  position: z.number(), // Position in seconds at serverTimeToExecute
});
export type PauseAction = z.infer<typeof PauseActionSchema>;

export const SeekActionSchema = z.object({
  type: z.literal('SEEK'),
  roomCode: z.string().length(6),
  serverTimeToExecute: z.number(),
  position: z.number(), // Target position in seconds
});
export type SeekAction = z.infer<typeof SeekActionSchema>;

export const NextActionSchema = z.object({
  type: z.literal('NEXT'),
  roomCode: z.string().length(6),
  serverTimeToExecute: z.number(),
});
export type NextAction = z.infer<typeof NextActionSchema>;

export const PrevActionSchema = z.object({
  type: z.literal('PREV'),
  roomCode: z.string().length(6),
  serverTimeToExecute: z.number(),
});
export type PrevAction = z.infer<typeof PrevActionSchema>;

export const SetPlaybackControlsSchema = z.object({
  type: z.literal('SET_PLAYBACK_CONTROLS'),
  roomCode: z.string().length(6),
  serverTimeToExecute: z.number(),
  controls: z.object({
    repeatMode: RepeatModeSchema.optional(),
    isShuffle: z.boolean().optional(),
    sharedVolume: z.number().min(0).max(1).optional(),
    crossfadeMs: z.number().nonnegative().optional(),
    automix: z.boolean().optional(),
  }),
});
export type SetPlaybackControls = z.infer<typeof SetPlaybackControlsSchema>;

export const SpatialConfigActionSchema = z.object({
  type: z.literal('SPATIAL_CONFIG'),
  roomCode: z.string().length(6),
  serverTimeToExecute: z.number(),
  listeningSource: PositionSchema,
  deviceGains: z.record(z.string(), z.object({
    gain: z.number().min(0).max(1),
    rampTime: z.number().nonnegative().default(0.1),
  })),
});
export type SpatialConfigAction = z.infer<typeof SpatialConfigActionSchema>;

export const LowPassConfigActionSchema = z.object({
  type: z.literal('LOW_PASS_CONFIG'),
  roomCode: z.string().length(6),
  serverTimeToExecute: z.number(),
  freq: z.number()
    .min(AUDIO_CONSTANTS.LOW_PASS_MIN_FREQ)
    .max(AUDIO_CONSTANTS.LOW_PASS_MAX_FREQ),
  rampTime: z.number().nonnegative().default(0.1),
});
export type LowPassConfigAction = z.infer<typeof LowPassConfigActionSchema>;

export const MetronomeConfigActionSchema = z.object({
  type: z.literal('METRONOME_CONFIG'),
  roomCode: z.string().length(6),
  serverTimeToExecute: z.number(),
  enabled: z.boolean(),
  bpm: z.number().positive().optional(),
});
export type MetronomeConfigAction = z.infer<typeof MetronomeConfigActionSchema>;

// Queue actions
export const QueueAddSchema = z.object({
  type: z.literal('QUEUE_ADD'),
  roomCode: z.string().length(6),
  items: z.array(MediaItemInputSchema),
  playNow: z.boolean().default(false), // If true, play immediately after adding
});
export type QueueAdd = z.infer<typeof QueueAddSchema>;

export const QueueRemoveSchema = z.object({
  type: z.literal('QUEUE_REMOVE'),
  roomCode: z.string().length(6),
  itemId: z.string(),
});
export type QueueRemove = z.infer<typeof QueueRemoveSchema>;

export const QueueReorderSchema = z.object({
  type: z.literal('QUEUE_REORDER'),
  roomCode: z.string().length(6),
  fromIndex: z.number().nonnegative(),
  toIndex: z.number().nonnegative(),
});
export type QueueReorder = z.infer<typeof QueueReorderSchema>;

export const QueueClearSchema = z.object({
  type: z.literal('QUEUE_CLEAR'),
  roomCode: z.string().length(6),
});
export type QueueClear = z.infer<typeof QueueClearSchema>;

export const QueuePlayIndexSchema = z.object({
  type: z.literal('QUEUE_PLAY_INDEX'),
  roomCode: z.string().length(6),
  index: z.number().nonnegative(),
  serverTimeToExecute: z.number(),
});
export type QueuePlayIndex = z.infer<typeof QueuePlayIndexSchema>;

export const PlaybackTrackEndedSchema = z.object({
  type: z.literal('PLAYBACK_TRACK_ENDED'),
  roomCode: z.string().length(6),
  trackId: z.string(),
});
export type PlaybackTrackEnded = z.infer<typeof PlaybackTrackEndedSchema>;

// Metrics
export const DriftReportSchema = z.object({
  type: z.literal('DRIFT_REPORT'),
  roomCode: z.string().length(6),
  drift: z.number(),
  ping: z.number(),
  outputLatencyMs: z.number().optional(),
});
export type DriftReport = z.infer<typeof DriftReportSchema>;

export const MediaDurationSchema = z.object({
  type: z.literal('MEDIA_DURATION'),
  roomCode: z.string().length(6),
  itemId: z.string(),
  duration: z.number().nonnegative(),
});
export type MediaDuration = z.infer<typeof MediaDurationSchema>;

// Nudge offset (manual timing adjustment)
export const NudgeOffsetSchema = z.object({
  type: z.literal('NUDGE_OFFSET'),
  roomCode: z.string().length(6),
  nudgeOffsetMs: z.number(),
});
export type NudgeOffset = z.infer<typeof NudgeOffsetSchema>;

// Admin actions
export const ClaimAdminSchema = z.object({
  type: z.literal('CLAIM_ADMIN'),
  roomCode: z.string().length(6),
});
export type ClaimAdmin = z.infer<typeof ClaimAdminSchema>;

export const MakeAdminSchema = z.object({
  type: z.literal('MAKE_ADMIN'),
  roomCode: z.string().length(6),
  targetUserId: z.string(),
});
export type MakeAdmin = z.infer<typeof MakeAdminSchema>;

export const KickUserSchema = z.object({
  type: z.literal('KICK_USER'),
  roomCode: z.string().length(6),
  targetUserId: z.string(),
});
export type KickUser = z.infer<typeof KickUserSchema>;

// Union of all client -> server messages
export const WSRequestSchema = z.discriminatedUnion('type', [
  NTPRequestSchema,
  NTPProbePairSchema,
  RoomCreateSchema,
  RoomJoinSchema,
  RoomResumeSchema,
  RoomLeaveSchema,
  RoomEndSchema,
  PlayActionSchema,
  PauseActionSchema,
  SeekActionSchema,
  NextActionSchema,
  PrevActionSchema,
  SetPlaybackControlsSchema,
  SpatialConfigActionSchema,
  LowPassConfigActionSchema,
  MetronomeConfigActionSchema,
  QueueAddSchema,
  QueueRemoveSchema,
  QueueReorderSchema,
  QueueClearSchema,
  QueuePlayIndexSchema,
  PlaybackTrackEndedSchema,
  DriftReportSchema,
  MediaDurationSchema,
  NudgeOffsetSchema,
  ClaimAdminSchema,
  MakeAdminSchema,
  KickUserSchema,
]);
export type WSRequest = z.infer<typeof WSRequestSchema>;

// ============================================================================
// Server -> Client Messages (WSBroadcast / WSUnicast)
// ============================================================================

export const NTPResponseSchema = z.object({
  type: z.literal('NTP_RESPONSE'),
  probeId: z.number(),
  clientTime: z.number(), // Original client time from request
  serverReceiveTime: z.number(), // Server receive time
  serverSendTime: z.number(), // Server send time
  probeGapValid: z.boolean().optional(), // For coded probe pairs
});
export type NTPResponse = z.infer<typeof NTPResponseSchema>;

export const NTPProbePairResponseSchema = z.object({
  type: z.literal('NTP_PROBE_PAIR_RESPONSE'),
  probeA_receive: z.number(),
  probeB_receive: z.number(),
  probeGapValid: z.boolean(),
});
export type NTPProbePairResponse = z.infer<typeof NTPProbePairResponseSchema>;

export const RoomCreatedSchema = z.object({
  type: z.literal('ROOM_CREATED'),
  roomCode: z.string().length(6),
  user: RoomUserSchema,
  state: RoomStateSchema,
  sessionToken: z.string(),
});
export type RoomCreated = z.infer<typeof RoomCreatedSchema>;

export const RoomJoinedSchema = z.object({
  type: z.literal('ROOM_JOINED'),
  roomCode: z.string().length(6),
  user: RoomUserSchema,
  state: RoomStateSchema,
  sessionToken: z.string(),
  isNewRoom: z.boolean().default(false),
  reconnected: z.boolean().default(false),
});
export type RoomJoined = z.infer<typeof RoomJoinedSchema>;

export const RoomStateUpdateSchema = z.object({
  type: z.literal('ROOM_STATE_UPDATE'),
  state: RoomStateSchema,
});
export type RoomStateUpdate = z.infer<typeof RoomStateUpdateSchema>;

export const RoomUserJoinedSchema = z.object({
  type: z.literal('ROOM_USER_JOINED'),
  user: RoomUserSchema,
});
export type RoomUserJoined = z.infer<typeof RoomUserJoinedSchema>;

export const RoomUserLeftSchema = z.object({
  type: z.literal('ROOM_USER_LEFT'),
  userId: z.string(),
});
export type RoomUserLeft = z.infer<typeof RoomUserLeftSchema>;

export const RoomAdminChangedSchema = z.object({
  type: z.literal('ROOM_ADMIN_CHANGED'),
  newAdminId: z.string(),
  username: z.string(),
});
export type RoomAdminChanged = z.infer<typeof RoomAdminChangedSchema>;

export const RoomEndedSchema = z.object({
  type: z.literal('ROOM_ENDED'),
  reason: z.enum(['ended', 'expired']),
  message: z.string(),
});
export type RoomEnded = z.infer<typeof RoomEndedSchema>;

export const RoomErrorSchema = z.object({
  type: z.literal('ROOM_ERROR'),
  code: z.string(),
  message: z.string(),
});
export type RoomError = z.infer<typeof RoomErrorSchema>;

export const RoomExpiredSchema = z.object({
  type: z.literal('ROOM_EXPIRED'),
});
export type RoomExpired = z.infer<typeof RoomExpiredSchema>;

export const PlaybackSyncSchema = z.object({
  type: z.literal('PLAYBACK_SYNC'),
  playback: PlaybackStateSchema,
  serverTime: z.number(),
});
export type PlaybackSync = z.infer<typeof PlaybackSyncSchema>;

export const ScheduledActionSchema = z.object({
  type: z.literal('SCHEDULED_ACTION'),
  serverTimeToExecute: z.number(),
  action: z.discriminatedUnion('type', [
    PlayActionSchema,
    PauseActionSchema,
    SeekActionSchema,
    NextActionSchema,
    PrevActionSchema,
    SetPlaybackControlsSchema,
    SpatialConfigActionSchema,
    LowPassConfigActionSchema,
    MetronomeConfigActionSchema,
  ]),
});
export type ScheduledAction = z.infer<typeof ScheduledActionSchema>;

export const QueueUpdatedSchema = z.object({
  type: z.literal('QUEUE_UPDATED'),
  queue: z.array(MediaItemSchema),
  currentIndex: z.number(),
});
export type QueueUpdated = z.infer<typeof QueueUpdatedSchema>;

export const QueuePlayNowSchema = z.object({
  type: z.literal('QUEUE_PLAY_NOW'),
  item: MediaItemInputSchema,
  roomCode: z.string().length(6),
});
export type QueuePlayNow = z.infer<typeof QueuePlayNowSchema>;

export const StreamJobUpdateSchema = z.object({
  type: z.literal('STREAM_JOB_UPDATE'),
  activeJobCount: z.number().nonnegative(),
});
export type StreamJobUpdate = z.infer<typeof StreamJobUpdateSchema>;

export const SearchResponseSchema = z.object({
  type: z.literal('SEARCH_RESPONSE'),
  results: z.array(MediaItemInputSchema),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const LivenessPingSchema = z.object({
  type: z.literal('LIVENESS_PING'),
  timestamp: z.number(),
});
export type LivenessPing = z.infer<typeof LivenessPingSchema>;

export const LivenessPongSchema = z.object({
  type: z.literal('LIVENESS_PONG'),
  timestamp: z.number(),
});
export type LivenessPong = z.infer<typeof LivenessPongSchema>;

// Server hello (sent on connect)
export const ServerHelloSchema = z.object({
  type: z.literal('SERVER_HELLO'),
  serverTime: z.number(),
  socketId: z.string(),
  config: z.object({
    scheduleDelayMs: z.number(),
    heartbeatIntervalMs: z.number(),
    disconnectGraceMs: z.number(),
    maxUsersPerRoom: z.number(),
    maxQueueLength: z.number(),
    uploadMaxBytes: z.number(),
  }),
});
export type ServerHello = z.infer<typeof ServerHelloSchema>;

// Union of all server -> client messages
export const WSBroadcastSchema = z.discriminatedUnion('type', [
  NTPResponseSchema,
  NTPProbePairResponseSchema,
  RoomCreatedSchema,
  RoomJoinedSchema,
  RoomStateUpdateSchema,
  RoomUserJoinedSchema,
  RoomUserLeftSchema,
  RoomAdminChangedSchema,
  RoomEndedSchema,
  RoomErrorSchema,
  RoomExpiredSchema,
  PlaybackSyncSchema,
  ScheduledActionSchema,
  QueueUpdatedSchema,
  QueuePlayNowSchema,
  StreamJobUpdateSchema,
  SearchResponseSchema,
  LivenessPingSchema,
  ServerHelloSchema,
]);
export type WSBroadcast = z.infer<typeof WSBroadcastSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

export function validateWSRequest(data: unknown): WSRequest {
  return WSRequestSchema.parse(data);
}

export function validateWSBroadcast(data: unknown): WSBroadcast {
  return WSBroadcastSchema.parse(data);
}

export function validateResolveMediaResponse(data: unknown): ResolveMediaResponse {
  return ResolveMediaResponseSchema.parse(data);
}

// ============================================================================
// Room Code Validation
// ============================================================================

export function isValidRoomCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export function generateRoomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}