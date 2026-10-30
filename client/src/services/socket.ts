import { io, type Socket } from 'socket.io-client';

const envUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();

/**
 * Resolve the backend origin.
 *
 * - When `VITE_SERVER_URL` is set, use it (e.g. split frontend on Vercel, backend on Render).
 * - When running in local development on port 3000 / 5173, point directly to http://localhost:5000.
 * - Otherwise use current origin (unified server).
 */
export const SERVER_URL =
  (envUrl && envUrl.replace(/\/+$/, '')) ||
  (typeof window !== 'undefined' && (window.location.port === '3000' || window.location.port === '5173')
    ? `http://${window.location.hostname}:5000`
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
  reconnectionDelay: 500,
  reconnectionDelayMax: 4_000,
  randomizationFactor: 0.3,
  timeout: 15_000,
  transports: ['websocket', 'polling'],
});

/**
 * Wait for an active socket, actively triggering connect() if needed.
 */
export function waitForConnection(timeoutMs = 6_000): Promise<boolean> {
  if (socket.connected) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      socket.off('connect', onConnect);
      resolve(connected);
    };

    const onConnect = () => finish(true);
    const timer = window.setTimeout(() => finish(socket.connected), timeoutMs);

    socket.once('connect', onConnect);
    socket.connect();
  });
}
