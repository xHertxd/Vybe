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
    // 3. If deployed on Vercel or other static CDN without an embedded Socket.io server
    if (window.location.hostname.endsWith('.vercel.app') || window.location.hostname.endsWith('.netlify.app')) {
      return 'https://vybe-relay.onrender.com';
    }
    // 4. Default to same origin (e.g. if served directly from Render or custom fullstack host)
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

