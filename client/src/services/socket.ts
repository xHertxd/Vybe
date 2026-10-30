import { io, type Socket } from 'socket.io-client';

const envUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();

/**
 * Resolve the backend origin.
 *
 * - When `VITE_SERVER_URL` is set, use it (split frontend/backend deploy).
 * - Otherwise stay on the current origin. Vite proxies `/api`, `/uploads` and
 *   `/socket.io` to the Node server in development, and the Node server serves
 *   the built client in production.
 */
export const SERVER_URL =
  (envUrl && envUrl.replace(/\/+$/, '')) ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

export function getApiUrl(path: string): string {
  const base = SERVER_URL.replace(/\/+$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}

export const socket: Socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 700,
  reconnectionDelayMax: 5_000,
  randomizationFactor: 0.4,
  timeout: 20_000,
  transports: ['websocket', 'polling'],
});

/**
 * Wait for an active socket, nudging the connection if it went idle.
 * Resolves `true` as soon as the socket is connected, `false` on timeout.
 */
export function waitForConnection(timeoutMs = 8_000): Promise<boolean> {
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

    socket.on('connect', onConnect);
    if (!socket.active) socket.connect();
  });
}
