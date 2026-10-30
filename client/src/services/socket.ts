import { io, Socket } from 'socket.io-client';

// Configurable backend URL: supports VITE_SERVER_URL environment variable for Vercel/Netlify deployments,
// falls back to localhost:5000 in local development, or same-origin for unified servers.
export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  (window.location.port === '3000' ? 'http://localhost:5000' : window.location.origin);

export function getApiUrl(path: string): string {
  const cleanBase = SERVER_URL.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

export const socket: Socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
  transports: ['websocket', 'polling']
});

// User session storage helpers
const STORAGE_USER_ID_KEY = 'vybe_user_id';
const STORAGE_USERNAME_KEY = 'vybe_username';

export function getStoredUserId(): string {
  let id = localStorage.getItem(STORAGE_USER_ID_KEY);
  if (!id) {
    id = 'user_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem(STORAGE_USER_ID_KEY, id);
  }
  return id;
}

export function getStoredUsername(): string {
  return localStorage.getItem(STORAGE_USERNAME_KEY) || '';
}

export function setStoredUsername(username: string): void {
  localStorage.setItem(STORAGE_USERNAME_KEY, username);
}
