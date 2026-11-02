import { io, type Socket } from 'socket.io-client';

function getBackendUrl(): string {
  // 1. Explicit env variable
  if (import.meta.env.VITE_SERVER_URL) {
    return (import.meta.env.VITE_SERVER_URL as string).replace(/\/+$/, '');
  }

  // 2. Local dev
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:10000';
    }
    // 3. Deployed frontend with backend proxy or custom domain
    return window.location.origin;
  }

  return 'http://localhost:10000';
}

export const BACKEND_URL = getBackendUrl();

export const socket: Socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

