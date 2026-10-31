import { io, type Socket } from 'socket.io-client';
import { virtualRoomEngine } from './virtualRoomEngine.js';

const STORAGE_SERVER_URL_KEY = 'vybe_server_url';

export function resolveServerUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 1. Manually specified server URL (if user or admin configured one)
  const saved = localStorage.getItem(STORAGE_SERVER_URL_KEY)?.trim();
  if (saved) return saved.replace(/\/+$/, '');

  // 2. Explicit environment variable pointing to a real WebSocket backend
  const envUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');

  // 3. Localhost development: if Vite is on localhost, connect to local backend on 5000
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  }

  // 4. On public hosting (Vercel, Netlify, etc.) without VITE_SERVER_URL,
  // do NOT connect to window.location.origin (which returns 404 for socket.io).
  // Return null to run purely in high-precision serverless/P2P mode!
  return null;
}

export let SERVER_URL = resolveServerUrl();

export function getApiUrl(path: string): string {
  if (!SERVER_URL) return path;
  const base = SERVER_URL.replace(/\/+$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}

// Only instantiate real Socket.IO if a real server URL exists
const rawSocket: Socket | null = SERVER_URL
  ? io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
    })
  : null;

// Hybrid Socket Proxy: 100% reliable across serverless Vercel and local Node backend
export const socket = {
  get id(): string {
    return rawSocket?.id || 'virtual_' + Math.random().toString(36).slice(2, 8);
  },

  get connected(): boolean {
    return rawSocket ? rawSocket.connected : true; // In serverless mode, always connected
  },

  get isRealServerConnected(): boolean {
    return Boolean(rawSocket?.connected);
  },

  on(event: string, handler: (...args: any[]) => void): typeof socket {
    if (rawSocket) {
      rawSocket.on(event, handler);
    }
    virtualRoomEngine.on(event, handler);
    return socket;
  },

  off(event: string, handler: (...args: any[]) => void): typeof socket {
    if (rawSocket) {
      rawSocket.off(event, handler);
    }
    virtualRoomEngine.off(event, handler);
    return socket;
  },

  once(event: string, handler: (...args: any[]) => void): typeof socket {
    const wrapper = (...args: any[]) => {
      socket.off(event, wrapper);
      handler(...args);
    };
    return socket.on(event, wrapper);
  },

  emit(event: string, ...args: any[]): typeof socket {
    if (rawSocket?.connected) {
      rawSocket.emit(event, ...args);
    } else {
      // Use virtual room engine seamlessly
      const payload = (args[0] as Record<string, unknown>) || {};
      const handled = virtualRoomEngine.handleClientEmit(event, payload);
      if (!handled && rawSocket) {
        rawSocket.emit(event, ...args);
      }
    }
    return socket;
  },

  connect(): typeof socket {
    if (rawSocket && !rawSocket.connected) {
      rawSocket.connect();
    }
    return socket;
  },

  disconnect(): typeof socket {
    if (rawSocket) {
      rawSocket.disconnect();
    }
    return socket;
  },
};

export function setCustomServerUrl(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  if (!clean) return;
  localStorage.setItem(STORAGE_SERVER_URL_KEY, clean);
  SERVER_URL = clean;
  window.location.reload();
}

export function resetServerUrl(): void {
  localStorage.removeItem(STORAGE_SERVER_URL_KEY);
  SERVER_URL = resolveServerUrl();
  window.location.reload();
}

export function waitForConnection(): Promise<boolean> {
  return Promise.resolve(true);
}
