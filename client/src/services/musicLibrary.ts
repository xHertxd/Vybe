import type { MediaItemInput } from '../types.js';
import { getApiUrl } from './socket.js';

export async function searchSongs(query: string): Promise<MediaItemInput[]> {
  const clean = query.trim();
  if (!clean) return [];

  // Primary: Unified FreeToUse + YouTube search through backend API
  try {
    const url = getApiUrl(`/api/search?q=${encodeURIComponent(clean)}&limit=25`);
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = (await res.json()) as { success?: boolean; results?: MediaItemInput[] };
      if (data.success && data.results && data.results.length > 0) {
        return data.results;
      }
    }
  } catch {
    // Backend search offline or timed out
  }

  return [];
}

export async function fetchInitialTracks(limit = 20): Promise<MediaItemInput[]> {
  try {
    const url = getApiUrl(`/api/library/trending?limit=${limit}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = (await res.json()) as { success?: boolean; tracks?: MediaItemInput[] };
      if (data.success && data.tracks && data.tracks.length > 0) {
        return data.tracks;
      }
    }
  } catch {
    // Backend unavailable
  }
  return [];
}

export function extractYouTubeId(url: string): string | null {
  const clean = url.trim();
  const match =
    clean.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/) ||
    clean.match(/^([\w-]{11})$/);
  return match ? match[1] : null;
}

export function extractSpotifyId(url: string): string | null {
  const clean = url.trim();
  const match = clean.match(/spotify\.com\/track\/([a-zA-Z0-9]{22})/);
  return match ? match[1] : null;
}

export async function resolveDirectMedia(input: string): Promise<MediaItemInput> {
  const clean = input.trim();

  // 1. Try backend resolver first (fetches real duration, high-res metadata)
  try {
    const res = await fetch(getApiUrl('/api/resolve-media'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: clean }),
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = (await res.json()) as { success?: boolean; data?: { items?: MediaItemInput[] } };
      if (data.success && data.data?.items?.[0]) {
        return data.data.items[0];
      }
    }
  } catch {
    // Continue to client fallback
  }

  // YouTube direct link
  const ytId = extractYouTubeId(clean);
  if (ytId) {
    let title = 'YouTube Track';
    let artist = 'YouTube';
    let thumbnail = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    let duration = 0; // Set to 0 so player measures and sets exact duration immediately!

    try {
      const res = await fetch(
        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytId}`
      );
      if (res.ok) {
        const data = (await res.json()) as { title?: string; author_name?: string };
        if (data.title) title = data.title;
        if (data.author_name) artist = data.author_name;
      }
    } catch {
      // Fallback to defaults
    }

    return {
      provider: 'youtube',
      sourceType: 'video',
      mediaId: ytId,
      url: `https://www.youtube.com/watch?v=${ytId}`,
      title,
      artist,
      thumbnail,
      duration,
      isPlayable: true,
    };
  }

  // Spotify direct track link
  const spotifyId = extractSpotifyId(clean);
  if (spotifyId) {
    let title = 'Spotify Track';
    let artist = 'Spotify Artist';
    let thumbnail = '';

    try {
      const res = await fetch(
        `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${spotifyId}`
      );
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          thumbnail_url?: string;
        };
        if (data.title) {
          const parts = data.title.split(' - ');
          if (parts.length >= 2) {
            artist = parts[0];
            title = parts.slice(1).join(' - ');
          } else {
            title = data.title;
          }
        }
        if (data.thumbnail_url) thumbnail = data.thumbnail_url;
      }
    } catch {
      // Fallback
    }

    return {
      provider: 'spotify',
      sourceType: 'track',
      mediaId: spotifyId,
      url: `https://open.spotify.com/track/${spotifyId}`,
      title,
      artist,
      thumbnail,
      duration: 210,
      isPlayable: true,
    };
  }

  // Direct Audio URL (MP3, WAV, OGG, etc.)
  if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(clean)) {
    const filename = clean.split('/').pop()?.split('?')[0] || 'Audio Track';
    return {
      provider: 'audio',
      sourceType: 'track',
      mediaId: `direct_${Date.now()}`,
      url: clean,
      title: decodeURIComponent(filename.replace(/\.[a-z0-9]+$/i, '')),
      artist: 'Web Audio',
      thumbnail: '',
      duration: 180,
      isPlayable: true,
    };
  }

  throw new Error(
    'Please paste a valid YouTube video link, Spotify track link, or direct audio file URL.'
  );
}
