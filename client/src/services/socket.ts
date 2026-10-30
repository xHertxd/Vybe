import { io, type Socket } from 'socket.io-client';

const STORAGE_SERVER_URL_KEY = 'vybe_server_url';

export function resolveServerUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:5000';

  // 1. User manual override stored in localStorage
  const saved = localStorage.getItem(STORAGE_SERVER_URL_KEY)?.trim();
  if (saved) return saved.replace(/\/+$/, '');

  // 2. Vite environment variable
  const envUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');

  // 3. Local development
  const hostname = window.location.hostname;
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local');

  if (isLocal) {
    return `http://${hostname}:5000`;
  }

  // 4. Production unified server or same origin
  return window.location.origin;
}

export let SERVER_URL = resolveServerUrl();

export function getApiUrl(path: string): string {
  const base = SERVER_URL.replace(/\/+$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'error' | 'disconnected';

export interface ConnectionInfo {
  status: ConnectionStatus;
  url: string;
  host: string;
  lastError: string | null;
  isCustom: boolean;
}

function extractHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return url;
  }
}

let currentStatus: ConnectionStatus = 'connecting';
let lastErrorMessage: string | null = null;
const listeners = new Set<(info: ConnectionInfo) => void>();

export function getConnectionInfo(): ConnectionInfo {
  return {
    status: socket.connected ? 'connected' : currentStatus,
    url: SERVER_URL,
    host: extractHost(SERVER_URL),
    lastError: lastErrorMessage,
    isCustom: Boolean(localStorage.getItem(STORAGE_SERVER_URL_KEY)),
  };
}

function notifyListeners() {
  const info = getConnectionInfo();
  listeners.forEach((fn) => fn(info));
}

export function subscribeConnectionInfo(callback: (info: ConnectionInfo) => void): () => void {
  listeners.add(callback);
  callback(getConnectionInfo());
  return () => {
    listeners.delete(callback);
  };
}

export const socket: Socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  currentStatus = 'connected';
  lastErrorMessage = null;
  notifyListeners();
});

socket.on('disconnect', (reason) => {
  currentStatus = reason === 'io client disconnect' ? 'disconnected' : 'connecting';
  notifyListeners();
});

socket.on('connect_error', (error) => {
  currentStatus = 'error';
  lastErrorMessage = error?.message || 'Unable to reach backend server.';
  notifyListeners();
});

export function setCustomServerUrl(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  if (!clean) return;
  localStorage.setItem(STORAGE_SERVER_URL_KEY, clean);
  SERVER_URL = clean;
  currentStatus = 'connecting';
  lastErrorMessage = null;
  notifyListeners();

  // Reconnect socket to new URL
  try {
    socket.disconnect();
    (socket as unknown as { io: { uri: string } }).io.uri = clean;
    socket.connect();
  } catch {
    window.location.reload();
  }
}

export function resetServerUrl(): void {
  localStorage.removeItem(STORAGE_SERVER_URL_KEY);
  SERVER_URL = resolveServerUrl();
  currentStatus = 'connecting';
  lastErrorMessage = null;
  notifyListeners();

  try {
    socket.disconnect();
    (socket as unknown as { io: { uri: string } }).io.uri = SERVER_URL;
    socket.connect();
  } catch {
    window.location.reload();
  }
}

export function waitForConnection(timeoutMs = 5000): Promise<boolean> {
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
    if (!socket.connected) {
      socket.connect();
    }
  });
}
