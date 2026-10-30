import { io, Socket } from 'socket.io-client';

// Use same host or fallback to port 5000 in dev
const SERVER_URL = window.location.port === '3000' ? 'http://localhost:5000' : '/';

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
