import type { MediaItemInput } from '../types.js';
import { config } from '../config.js';

export interface FreeToUseRawTrack {
  id: string;
  title: string;
  duration: number;
  genre?: string | null;
  plays?: number;
  views?: number;
  downloads?: number;
  artists?: Array<[number, { id: string; name: string }] | { id: string; name: string }>;
  artist?: string;
  thumbnails?: {
    sm?: string;
    md?: string;
    lg?: string;
    xl?: string;
  };
  files?: {
    mp3?: string;
    wav?: string;
  };
}

export interface FreeToUseCategory {
  id: string;
  name: string;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class FreeToUseService {
  private readonly baseUrl = config.freeToUseApiUrl;
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  private async fetchWithRetry(url: string, options: RequestInit = {}, retries = 2): Promise<Response> {
    for (let i = 0; ; i++) {
      try {
        return await fetch(url, options);
      } catch (err) {
        if (i >= retries) throw err;
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCached<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  private extractArtistName(track: FreeToUseRawTrack): string {
    if (track.artist && typeof track.artist === 'string') return track.artist.trim();
    if (Array.isArray(track.artists) && track.artists.length > 0) {
      const names: string[] = [];
      for (const item of track.artists) {
        if (Array.isArray(item) && item[1]?.name) {
          names.push(item[1].name);
        } else if (typeof item === 'object' && item !== null && 'name' in item && (item as { name?: string }).name) {
          names.push((item as { name: string }).name);
        }
      }
      if (names.length > 0) return names.join(', ');
    }
    return 'Free To Use';
  }

  public mapTrack(track: FreeToUseRawTrack): MediaItemInput {
    const artist = this.extractArtistName(track);
    const mp3Url = track.files?.mp3 || '';
    const thumbnail =
      track.thumbnails?.md ||
      track.thumbnails?.sm ||
      track.thumbnails?.lg ||
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80';

    return {
      provider: 'audio',
      sourceType: 'track',
      mediaId: `freetouse_${track.id}`,
      url: mp3Url,
      title: track.title?.trim() || 'Untitled Track',
      artist,
      album: track.genre ? `${track.genre} · Free To Use` : 'Free To Use Music',
      thumbnail,
      duration: Math.round(track.duration) || 0,
      isPlayable: Boolean(mp3Url),
    };
  }

  /**
   * Search FreeToUse catalog by search query (title, artist, tag, genre).
   */
  public async search(query: string, limit = 20): Promise<MediaItemInput[]> {
    const clean = query.trim();
    if (!clean) return this.getTrending(limit);

    const cacheKey = `search:${clean.toLowerCase()}:${limit}`;
    const cached = this.getCached<MediaItemInput[]>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/music/tracks/search?query=${encodeURIComponent(clean)}&limit=${limit}`;
      const res = await this.fetchWithRetry(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) return [];
      const json = (await res.json()) as { ok?: boolean; data?: FreeToUseRawTrack[] };
      if (!json.ok || !Array.isArray(json.data)) return [];

      const results = json.data
        .filter((t) => t && t.files?.mp3)
        .map((t) => this.mapTrack(t));

      this.setCached(cacheKey, results, 2 * 60 * 1000); // 2 minute cache
      return results;
    } catch (err) {
      console.warn('[FreeToUse] Search error:', err);
      return [];
    }
  }

  /**
   * Get trending / most played tracks.
   */
  public async getTrending(limit = 20): Promise<MediaItemInput[]> {
    const cacheKey = `trending:${limit}`;
    const cached = this.getCached<MediaItemInput[]>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/music/tracks/all?order=plays&sort=desc&limit=${limit}`;
      const res = await this.fetchWithRetry(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) return [];
      const json = (await res.json()) as { ok?: boolean; data?: FreeToUseRawTrack[] };
      if (!json.ok || !Array.isArray(json.data)) return [];

      const results = json.data
        .filter((t) => t && t.files?.mp3)
        .map((t) => this.mapTrack(t));

      this.setCached(cacheKey, results, 10 * 60 * 1000); // 10 minute cache
      return results;
    } catch (err) {
      console.warn('[FreeToUse] Trending error:', err);
      return [];
    }
  }

  /**
   * Get all categories / moods.
   */
  public async getCategories(): Promise<FreeToUseCategory[]> {
    const cacheKey = 'categories:all';
    const cached = this.getCached<FreeToUseCategory[]>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/music/categories/all?limit=50`;
      const res = await this.fetchWithRetry(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) return [];
      const json = (await res.json()) as { ok?: boolean; data?: FreeToUseCategory[] };
      if (!json.ok || !Array.isArray(json.data)) return [];

      const results = json.data.map((c) => ({ id: c.id, name: c.name }));
      this.setCached(cacheKey, results, 60 * 60 * 1000); // 1 hour cache
      return results;
    } catch (err) {
      console.warn('[FreeToUse] Categories error:', err);
      return [];
    }
  }

  /**
   * Get tracks by category ID.
   */
  public async getTracksByCategory(categoryId: string, limit = 20): Promise<MediaItemInput[]> {
    const cleanId = categoryId.trim();
    if (!cleanId) return [];

    const cacheKey = `category:${cleanId}:${limit}`;
    const cached = this.getCached<MediaItemInput[]>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/music/categories/${encodeURIComponent(cleanId)}/tracks?limit=${limit}`;
      const res = await this.fetchWithRetry(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) return [];
      const json = (await res.json()) as { ok?: boolean; data?: FreeToUseRawTrack[] };
      if (!json.ok || !Array.isArray(json.data)) return [];

      const results = json.data
        .filter((t) => t && t.files?.mp3)
        .map((t) => this.mapTrack(t));

      this.setCached(cacheKey, results, 10 * 60 * 1000);
      return results;
    } catch (err) {
      console.warn('[FreeToUse] Category tracks error:', err);
      return [];
    }
  }

  /**
   * Resolve a track URL or ID into a playable MediaItemInput.
   */
  public async resolveUrl(input: string): Promise<MediaItemInput | null> {
    const raw = input.trim();
    if (!raw) return null;

    // Check for UUID in URL or raw ID
    const uuidMatch = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
      const trackId = uuidMatch[0];
      try {
        const res = await this.fetchWithRetry(`${this.baseUrl}/music/tracks/${trackId}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const json = (await res.json()) as { ok?: boolean; data?: FreeToUseRawTrack };
          if (json.ok && json.data) {
            return this.mapTrack(json.data);
          }
        }
      } catch {}
    }

    // Check for freetouse.com/music/:artist/:title
    const slugMatch = raw.match(/freetouse\.com\/music\/([^/?#]+)\/([^/?#]+)/i);
    if (slugMatch) {
      const artist = slugMatch[1];
      const title = slugMatch[2];
      try {
        const res = await this.fetchWithRetry(`${this.baseUrl}/music/tracks/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const json = (await res.json()) as { ok?: boolean; data?: FreeToUseRawTrack };
          if (json.ok && json.data) {
            return this.mapTrack(json.data);
          }
        }
      } catch {}
    }

    return null;
  }
}

export const freeToUseService = new FreeToUseService();

