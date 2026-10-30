import { io, type Socket } from 'socket.io-client';

const envUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();

/**
 * In local development Vite proxies /api, /uploads and /socket.io to the Node
 * server. In production, point VITE_SERVER_URL at the deployed backend, or
 * leave it blank when the backend serves the built client (single process).
 */
export const SERVER_URL =
  envUrl ||
  (typeof window !== 'undefined' && window.location.port === '3000'
    ? 'http://localhost:5000'
    : typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:5000');

export function getApiUrl(path: string): string {
  const base = SERVER_URL.replace(/\/+$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}

export const socket: Socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 800,
  reconnectionDelayMax: 6_000,
  randomizationFactor: 0.4,
  timeout: 12_000,
  transports: ['websocket', 'polling'],
});
