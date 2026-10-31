// Beatsync-inspired NTP & Sync Constants
// Based on beatsync's Huygens algorithm implementation
export const NTP_CONSTANTS = {
    /** Initial rapid measurement interval (ms) */
    INITIAL_INTERVAL_MS: 50,
    /** Steady-state heartbeat interval (ms) */
    STEADY_STATE_INTERVAL_MS: 2500,
    /** Timeout before considering connection stale (ms) */
    RESPONSE_TIMEOUT_MS: 3750, // 1.5 * STEADY_STATE_INTERVAL_MS
    /** Maximum initial measurements to collect */
    MAX_MEASUREMENTS: 16,
    /** Inter-departure gap between probe pairs (ms) - avoids TCP coalescing */
    PROBE_GAP_MS: 25,
    /** Acceptable tolerance for probe gap validation (ms) */
    PROBE_GAP_TOLERANCE_MS: 5,
};
export const SYNC_CONSTANTS = {
    /** How far in the future play commands are scheduled (ms) */
    SCHEDULE_DELAY_MS: 600,
    /** Authoritative resync snapshot interval (ms) */
    HEARTBEAT_INTERVAL_MS: 5000,
    /** How long a dropped participant keeps their seat (ms) */
    DISCONNECT_GRACE_MS: 25000,
    /** Room idle timeout (ms) */
    ROOM_IDLE_TIMEOUT_MS: 12 * 60 * 60 * 1000,
    /** Maximum users per room */
    MAX_USERS_PER_ROOM: 50,
    /** Maximum queue length */
    MAX_QUEUE_LENGTH: 200,
    /** Upload max bytes (30MB) */
    UPLOAD_MAX_BYTES: 30 * 1024 * 1024,
};
export const AUDIO_CONSTANTS = {
    /** Default BPM for metronome */
    DEFAULT_BPM: 120,
    /** Beat interval in ms at default BPM */
    BEAT_INTERVAL_MS: 500, // 60000 / 120
    /** Low-pass filter frequency range */
    LOW_PASS_MIN_FREQ: 20,
    LOW_PASS_MAX_FREQ: 20000,
    /** Spatial audio grid size */
    SPATIAL_GRID_SIZE: 100,
    /** Spatial audio client radius */
    SPATIAL_CLIENT_RADIUS: 25,
};
export const WS_CONSTANTS = {
    /** WebSocket path */
    WS_PATH: '/socket.io',
    /** Reconnection settings */
    RECONNECTION_ATTEMPTS: Infinity,
    RECONNECTION_DELAY_MS: 700,
    RECONNECTION_DELAY_MAX_MS: 5000,
    RECONNECTION_RANDOMIZATION: 0.4,
    TIMEOUT_MS: 20000,
};
