import type { StoredSession } from '../types.js';

const SESSION_KEY = 'vybe_session_v2';
const USERNAME_KEY = 'vybe_username';
const SPOTIFY_RETURN_KEY = 'vybe_spotify_return';

function safeParse(value: string | null): StoredSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredSession>;
    if (
      typeof parsed.roomCode === 'string' &&
      /^\d{6}$/.test(parsed.roomCode) &&
      typeof parsed.userId === 'string' &&
      parsed.userId.length > 0 &&
      typeof parsed.sessionToken === 'string' &&
      parsed.sessionToken.length > 0 &&
      typeof parsed.username === 'string'
    ) {
      return parsed as StoredSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function readSession(): StoredSession | null {
  return safeParse(localStorage.getItem(SESSION_KEY));
}

export function writeSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function getSavedUsername(): string {
  return localStorage.getItem(USERNAME_KEY) || '';
}

export function saveUsername(username: string): void {
  localStorage.setItem(USERNAME_KEY, username);
}

export function setSpotifyReturnPath(path: string): void {
  localStorage.setItem(SPOTIFY_RETURN_KEY, path);
}

export function takeSpotifyReturnPath(): string | null {
  const value = localStorage.getItem(SPOTIFY_RETURN_KEY);
  if (value) localStorage.removeItem(SPOTIFY_RETURN_KEY);
  return value;
}
