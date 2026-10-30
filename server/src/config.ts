import 'dotenv/config';

function intFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function listFromEnv(name: string): string[] | null {
  const raw = process.env[name];
  if (!raw) return null;
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 ? values : null;
}

export const config = {
  port: intFromEnv('PORT', 5000),
  nodeEnv: process.env.NODE_ENV || 'development',

  /** Optional allow-list. Leave unset for local development / preview deploys. */
  allowedOrigins: listFromEnv('ALLOWED_ORIGINS'),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',

  /** How long a dropped participant keeps their seat and username (30 minutes to prevent accidental room drops). */
  disconnectGraceMs: intFromEnv('DISCONNECT_GRACE_MS', 30 * 60 * 1000),
  /** How far in the future play commands are scheduled, so every client can buffer. */
  scheduleDelayMs: intFromEnv('SYNC_SCHEDULE_DELAY_MS', 600),
  /** Authoritative resync snapshot interval. */
  heartbeatIntervalMs: intFromEnv('SYNC_HEARTBEAT_MS', 5_000),
  roomIdleTimeoutMs: intFromEnv('ROOM_IDLE_TIMEOUT_MS', 12 * 60 * 60 * 1000),
  maxUsersPerRoom: intFromEnv('MAX_USERS_PER_ROOM', 50),
  maxQueueLength: intFromEnv('MAX_QUEUE_LENGTH', 200),
  uploadMaxBytes: intFromEnv('UPLOAD_MAX_BYTES', 30 * 1024 * 1024),

  youtubeApiKey: process.env.YOUTUBE_API_KEY?.trim() || '',
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID?.trim() || '',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET?.trim() || '',
};

export type AppConfig = typeof config;
