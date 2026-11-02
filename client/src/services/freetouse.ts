import type { Track } from '@vybe/shared';
import { BACKEND_URL } from './socket.js';

export async function searchFreeToUseTracks(query = '', limit = 20): Promise<Track[]> {
  try {
    const url = `${BACKEND_URL}/api/freetouse/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json() as { success: boolean; tracks: Track[] };
    return data.tracks || [];
  } catch (err) {
    console.warn('[FreeToUse] Search error:', err);
    return [];
  }
}

