import { io, type Socket } from 'socket.io-client';

function getBackendUrl(): string {
  if (import.meta.env.VITE_SERVER_URL) {
    return (import.meta.env.VITE_SERVER_URL as string).replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    // In Vite local development, direct to backend port 10000
    if (window.location.port === '5173' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:10000';
    }
    // In production on Render or Docker, frontend & backend are hosted together on the same origin
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
