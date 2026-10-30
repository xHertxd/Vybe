import type { MediaItemInput } from '../types.js';
import { getApiUrl } from './socket.js';

export interface FreeToUseCategory {
  id: string;
  name: string;
}

const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function invalidateFreeToUseCache(pattern?: string): void {
  if (!pattern) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Search the FreeToUse music library via backend proxy.
 */
export async function searchFreeToUseTracks(query: string, limit = 20): Promise<MediaItemInput[]> {
  const clean = query.trim();
  const cacheKey = `ftu:search:${clean.toLowerCase()}:${limit}`;
  const cached = getCached<MediaItemInput[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = getApiUrl(`/api/search?q=${encodeURIComponent(clean)}&limit=${limit}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];

    const json = (await res.json()) as { success?: boolean; results?: MediaItemInput[] };
    if (!json.success || !Array.isArray(json.results)) return [];

    setCached(cacheKey, json.results, 60 * 1000); // 1 minute client cache
    return json.results;
  } catch (err) {
    console.warn('Failed to search FreeToUse tracks:', err);
    return [];
  }
}

/**
 * Fetch top trending/popular tracks from FreeToUse.
 */
export async function fetchTrendingTracks(limit = 20): Promise<MediaItemInput[]> {
  const cacheKey = `ftu:trending:${limit}`;
  const cached = getCached<MediaItemInput[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = getApiUrl(`/api/library/trending?limit=${limit}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];

    const json = (await res.json()) as { success?: boolean; tracks?: MediaItemInput[] };
    if (!json.success || !Array.isArray(json.tracks)) return [];

    setCached(cacheKey, json.tracks, 5 * 60 * 1000); // 5 minute cache
    return json.tracks;
  } catch (err) {
    console.warn('Failed to fetch trending tracks:', err);
    return [];
  }
}

/**
 * Fetch list of categories (vibes/genres) from FreeToUse.
 */
export async function fetchCategories(): Promise<FreeToUseCategory[]> {
  const cacheKey = 'ftu:categories';
  const cached = getCached<FreeToUseCategory[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = getApiUrl('/api/library/categories');
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];

    const json = (await res.json()) as { success?: boolean; categories?: FreeToUseCategory[] };
    if (!json.success || !Array.isArray(json.categories)) return [];

    setCached(cacheKey, json.categories, 30 * 60 * 1000); // 30 minute cache
    return json.categories;
  } catch (err) {
    console.warn('Failed to fetch categories:', err);
    return [];
  }
}

/**
 * Fetch tracks belonging to a specific FreeToUse category.
 */
export async function fetchCategoryTracks(categoryId: string, limit = 20): Promise<MediaItemInput[]> {
  const cleanId = categoryId.trim();
  if (!cleanId) return [];

  const cacheKey = `ftu:cat:${cleanId}:${limit}`;
  const cached = getCached<MediaItemInput[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = getApiUrl(`/api/library/category/${encodeURIComponent(cleanId)}?limit=${limit}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];

    const json = (await res.json()) as { success?: boolean; tracks?: MediaItemInput[] };
    if (!json.success || !Array.isArray(json.tracks)) return [];

    setCached(cacheKey, json.tracks, 5 * 60 * 1000);
    return json.tracks;
  } catch (err) {
    console.warn(`Failed to fetch tracks for category ${categoryId}:`, err);
    return [];
  }
}

