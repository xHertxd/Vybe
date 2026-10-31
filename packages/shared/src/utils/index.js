// Shared utility functions
import { NTP_CONSTANTS, AUDIO_CONSTANTS } from '../constants';
/** Current epoch time in milliseconds */
export function epochNow() {
    return Date.now();
}
/** Generate a random user ID */
export function generateUserId() {
    return `usr_${Math.random().toString(36).slice(2, 9)}`;
}
/** Generate a random session token */
export function generateSessionToken() {
    return `tok_${Math.random().toString(36).slice(2, 11)}`;
}
/** Generate a random track ID */
export function generateTrackId() {
    return `track_${Math.random().toString(36).slice(2, 9)}`;
}
/** Format duration in seconds to MM:SS or HH:MM:SS */
export function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0)
        return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
        return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
}
/** Calculate distance between two positions on the spatial grid */
export function calculateDistance(pos1, pos2) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    return Math.sqrt(dx * dx + dy * dy);
}
/** Calculate gain based on distance from listening source (inverse square law with falloff) */
export function calculateSpatialGain(devicePos, listeningSource, maxDistance = AUDIO_CONSTANTS.SPATIAL_GRID_SIZE) {
    const distance = calculateDistance(devicePos, listeningSource);
    const normalized = Math.min(1, distance / maxDistance);
    // Smooth falloff: 1 at center, 0 at edge
    return Math.max(0, 1 - normalized * normalized);
}
/** Calculate panning based on position relative to listening source */
export function calculateSpatialPan(devicePos, listeningSource) {
    // Returns -1 (left) to 1 (right)
    const dx = devicePos.x - listeningSource.x;
    return Math.max(-1, Math.min(1, dx / (AUDIO_CONSTANTS.SPATIAL_GRID_SIZE / 2)));
}
/** Validate NTP probe pair gap (Huygens algorithm) */
export function validateProbeGap(probeA, probeB) {
    const gap = probeB - probeA;
    return Math.abs(gap - NTP_CONSTANTS.PROBE_GAP_MS) <= NTP_CONSTANTS.PROBE_GAP_TOLERANCE_MS;
}
/** Calculate round-trip time and offset from NTP response */
export function calculateNTPOffset(clientSendTime, serverReceiveTime, serverSendTime, clientReceiveTime) {
    const rtt = clientReceiveTime - clientSendTime;
    const offset = ((serverReceiveTime - clientSendTime) + (serverSendTime - clientReceiveTime)) / 2;
    return { rtt, offset };
}
/** Calculate offset from coded probe pair (Huygens) */
export function calculateOffsetFromProbePair(probeA_send, probeB_send, probeA_receive, probeB_receive) {
    const valid = validateProbeGap(probeA_send, probeB_send);
    if (!valid) {
        return { rtt: 0, offset: 0, valid: false };
    }
    const rtt = probeB_receive - probeA_send;
    // Use probe A for offset calculation (first probe)
    const offset = (probeA_receive - probeA_send + probeA_receive - probeB_receive + (probeB_send - probeA_send)) / 2;
    return { rtt, offset, valid: true };
}
/** Median of numbers (for NTP outlier rejection) */
export function median(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}
/** Clamp value between min and max */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/** Debounce function */
export function debounce(fn, delay) {
    let timeoutId = null;
    return (...args) => {
        if (timeoutId)
            clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}
/** Throttle function */
export function throttle(fn, limit) {
    let inThrottle = false;
    return (...args) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}
/** Deep clone */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
/** Safe JSON parse */
export function safeJsonParse(json, fallback) {
    try {
        return JSON.parse(json);
    }
    catch {
        return fallback;
    }
}
