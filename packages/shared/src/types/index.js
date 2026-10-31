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
export const MediaProviderSchema = z.enum(['youtube', 'spotify', 'audio']);
export const MediaSourceTypeSchema = z.enum([
    'video',
    'shorts',
    'playlist',
    'track',
    'album',
    'upload',
    'url',
]);
export const PlaybackStatusSchema = z.enum(['playing', 'paused', 'stopped']);
export const RepeatModeSchema = z.enum(['off', 'all', 'one']);
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
export const MediaItemSchema = MediaItemInputSchema.extend({
    id: z.string(),
    addedBy: z.string(),
    addedAt: z.number(),
});
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
// ============================================================================
// Client -> Server Messages (WSRequest)
// ============================================================================
export const NTPRequestSchema = z.object({
    type: z.literal('NTP_REQUEST'),
    clientTime: z.number(),
    probeId: z.number(), // For coded probe pairs
});
export const NTPProbePairSchema = z.object({
    type: z.literal('NTP_PROBE_PAIR'),
    probeA: z.number(), // Departure time of probe A
    probeB: z.number(), // Departure time of probe B (probeA + PROBE_GAP_MS)
    clientTime: z.number(),
});
export const RoomCreateSchema = z.object({
    type: z.literal('ROOM_CREATE'),
    username: z.string().min(2).max(20).regex(/^[A-Za-z]+$/),
    userId: z.string().optional(),
});
export const RoomJoinSchema = z.object({
    type: z.literal('ROOM_JOIN'),
    roomCode: z.string().length(6),
    username: z.string().min(2).max(20).regex(/^[A-Za-z]+$/),
    userId: z.string().optional(),
    sessionToken: z.string().optional(),
});
export const RoomResumeSchema = z.object({
    type: z.literal('ROOM_RESUME'),
    roomCode: z.string().length(6),
    userId: z.string(),
    sessionToken: z.string(),
    username: z.string().optional(),
});
export const RoomLeaveSchema = z.object({
    type: z.literal('ROOM_LEAVE'),
    roomCode: z.string().length(6).optional(),
});
export const RoomEndSchema = z.object({
    type: z.literal('ROOM_END'),
    roomCode: z.string().length(6).optional(),
});
// Playback actions (scheduled)
export const PlayActionSchema = z.object({
    type: z.literal('PLAY'),
    roomCode: z.string().length(6),
    serverTimeToExecute: z.number(), // Server epoch ms when all clients should start
});
export const PauseActionSchema = z.object({
    type: z.literal('PAUSE'),
    roomCode: z.string().length(6),
    serverTimeToExecute: z.number(),
    position: z.number(), // Position in seconds at serverTimeToExecute
});
export const SeekActionSchema = z.object({
    type: z.literal('SEEK'),
    roomCode: z.string().length(6),
    serverTimeToExecute: z.number(),
    position: z.number(), // Target position in seconds
});
export const NextActionSchema = z.object({
    type: z.literal('NEXT'),
    roomCode: z.string().length(6),
    serverTimeToExecute: z.number(),
});
export const PrevActionSchema = z.object({
    type: z.literal('PREV'),
    roomCode: z.string().length(6),
    serverTimeToExecute: z.number(),
});
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
export const LowPassConfigActionSchema = z.object({
    type: z.literal('LOW_PASS_CONFIG'),
    roomCode: z.string().length(6),
    serverTimeToExecute: z.number(),
    freq: z.number()
        .min(AUDIO_CONSTANTS.LOW_PASS_MIN_FREQ)
        .max(AUDIO_CONSTANTS.LOW_PASS_MAX_FREQ),
    rampTime: z.number().nonnegative().default(0.1),
});
export const MetronomeConfigActionSchema = z.object({
    type: z.literal('METRONOME_CONFIG'),
    roomCode: z.string().length(6),
    serverTimeToExecute: z.number(),
    enabled: z.boolean(),
    bpm: z.number().positive().optional(),
});
// Queue actions
export const QueueAddSchema = z.object({
    type: z.literal('QUEUE_ADD'),
    roomCode: z.string().length(6),
    items: z.array(MediaItemInputSchema),
    playNow: z.boolean().default(false), // If true, play immediately after adding
});
export const QueueRemoveSchema = z.object({
    type: z.literal('QUEUE_REMOVE'),
    roomCode: z.string().length(6),
    itemId: z.string(),
});
export const QueueReorderSchema = z.object({
    type: z.literal('QUEUE_REORDER'),
    roomCode: z.string().length(6),
    fromIndex: z.number().nonnegative(),
    toIndex: z.number().nonnegative(),
});
export const QueueClearSchema = z.object({
    type: z.literal('QUEUE_CLEAR'),
    roomCode: z.string().length(6),
});
export const QueuePlayIndexSchema = z.object({
    type: z.literal('QUEUE_PLAY_INDEX'),
    roomCode: z.string().length(6),
    index: z.number().nonnegative(),
    serverTimeToExecute: z.number(),
});
export const PlaybackTrackEndedSchema = z.object({
    type: z.literal('PLAYBACK_TRACK_ENDED'),
    roomCode: z.string().length(6),
    trackId: z.string(),
});
// Metrics
export const DriftReportSchema = z.object({
    type: z.literal('DRIFT_REPORT'),
    roomCode: z.string().length(6),
    drift: z.number(),
    ping: z.number(),
    outputLatencyMs: z.number().optional(),
});
export const MediaDurationSchema = z.object({
    type: z.literal('MEDIA_DURATION'),
    roomCode: z.string().length(6),
    itemId: z.string(),
    duration: z.number().nonnegative(),
});
// Nudge offset (manual timing adjustment)
export const NudgeOffsetSchema = z.object({
    type: z.literal('NUDGE_OFFSET'),
    roomCode: z.string().length(6),
    nudgeOffsetMs: z.number(),
});
// Admin actions
export const ClaimAdminSchema = z.object({
    type: z.literal('CLAIM_ADMIN'),
    roomCode: z.string().length(6),
});
export const MakeAdminSchema = z.object({
    type: z.literal('MAKE_ADMIN'),
    roomCode: z.string().length(6),
    targetUserId: z.string(),
});
export const KickUserSchema = z.object({
    type: z.literal('KICK_USER'),
    roomCode: z.string().length(6),
    targetUserId: z.string(),
});
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
export const NTPProbePairResponseSchema = z.object({
    type: z.literal('NTP_PROBE_PAIR_RESPONSE'),
    probeA_receive: z.number(),
    probeB_receive: z.number(),
    probeGapValid: z.boolean(),
});
export const RoomCreatedSchema = z.object({
    type: z.literal('ROOM_CREATED'),
    roomCode: z.string().length(6),
    user: RoomUserSchema,
    state: RoomStateSchema,
    sessionToken: z.string(),
});
export const RoomJoinedSchema = z.object({
    type: z.literal('ROOM_JOINED'),
    roomCode: z.string().length(6),
    user: RoomUserSchema,
    state: RoomStateSchema,
    sessionToken: z.string(),
    isNewRoom: z.boolean().default(false),
    reconnected: z.boolean().default(false),
});
export const RoomStateUpdateSchema = z.object({
    type: z.literal('ROOM_STATE_UPDATE'),
    state: RoomStateSchema,
});
export const RoomUserJoinedSchema = z.object({
    type: z.literal('ROOM_USER_JOINED'),
    user: RoomUserSchema,
});
export const RoomUserLeftSchema = z.object({
    type: z.literal('ROOM_USER_LEFT'),
    userId: z.string(),
});
export const RoomAdminChangedSchema = z.object({
    type: z.literal('ROOM_ADMIN_CHANGED'),
    newAdminId: z.string(),
    username: z.string(),
});
export const RoomEndedSchema = z.object({
    type: z.literal('ROOM_ENDED'),
    reason: z.enum(['ended', 'expired']),
    message: z.string(),
});
export const RoomErrorSchema = z.object({
    type: z.literal('ROOM_ERROR'),
    code: z.string(),
    message: z.string(),
});
export const RoomExpiredSchema = z.object({
    type: z.literal('ROOM_EXPIRED'),
});
export const PlaybackSyncSchema = z.object({
    type: z.literal('PLAYBACK_SYNC'),
    playback: PlaybackStateSchema,
    serverTime: z.number(),
});
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
export const QueueUpdatedSchema = z.object({
    type: z.literal('QUEUE_UPDATED'),
    queue: z.array(MediaItemSchema),
    currentIndex: z.number(),
});
export const QueuePlayNowSchema = z.object({
    type: z.literal('QUEUE_PLAY_NOW'),
    item: MediaItemInputSchema,
    roomCode: z.string().length(6),
});
export const StreamJobUpdateSchema = z.object({
    type: z.literal('STREAM_JOB_UPDATE'),
    activeJobCount: z.number().nonnegative(),
});
export const SearchResponseSchema = z.object({
    type: z.literal('SEARCH_RESPONSE'),
    results: z.array(MediaItemInputSchema),
});
export const LivenessPingSchema = z.object({
    type: z.literal('LIVENESS_PING'),
    timestamp: z.number(),
});
export const LivenessPongSchema = z.object({
    type: z.literal('LIVENESS_PONG'),
    timestamp: z.number(),
});
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
// ============================================================================
// Validation Helpers
// ============================================================================
export function validateWSRequest(data) {
    return WSRequestSchema.parse(data);
}
export function validateWSBroadcast(data) {
    return WSBroadcastSchema.parse(data);
}
export function validateResolveMediaResponse(data) {
    return ResolveMediaResponseSchema.parse(data);
}
// ============================================================================
// Room Code Validation
// ============================================================================
export function isValidRoomCode(code) {
    return /^\d{6}$/.test(code);
}
export function generateRoomCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
