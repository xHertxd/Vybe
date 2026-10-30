import type { MediaItemInput, MediaSourceType, ResolvedMedia } from '../types.js';

interface YouTubeUrlInfo {
  kind: 'video' | 'playlist';
  videoId?: string;
  listId?: string;
  sourceType: MediaSourceType;
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

interface PlaylistEntry {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

function isoDurationToSeconds(value?: string): number {
  if (!value) return 0;
  const match = value.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

function isYouTubeHost(hostname: string): boolean {
  return YOUTUBE_HOSTS.has(hostname.toLowerCase());
}

export class YouTubeIntegration {
  constructor(private readonly apiKey = '') {}

  public canExpandPlaylists(): boolean {
    return Boolean(this.apiKey);
  }

  public parseUrl(input: string): YouTubeUrlInfo | null {
    const raw = input.trim();
    if (!raw) return null;

    try {
      const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      if (!isYouTubeHost(url.hostname)) return null;

      const host = url.hostname.toLowerCase();
      const path = url.pathname.replace(/\/+$/, '');

      if (host === 'youtu.be' || host === 'www.youtu.be') {
        const id = path.split('/').filter(Boolean)[0];
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
          return { kind: 'video', videoId: id, sourceType: 'video' };
        }
        return null;
      }

      const listId = url.searchParams.get('list') || undefined;
      const v = url.searchParams.get('v') || undefined;

      if (path.startsWith('/shorts/')) {
        const id = path.split('/')[2];
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
          return { kind: 'video', videoId: id, sourceType: 'shorts' };
        }
      }

      if (path.startsWith('/embed/') || path.startsWith('/live/')) {
        const id = path.split('/')[2];
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
          return { kind: 'video', videoId: id, sourceType: 'video' };
        }
      }

      if (path === '/playlist' && listId) {
        return { kind: 'playlist', listId, videoId: v, sourceType: 'playlist' };
      }

      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) {
        if (listId && !listId.startsWith('RD')) {
          return { kind: 'playlist', listId, videoId: v, sourceType: 'playlist' };
        }
        return {
          kind: 'video',
          videoId: v,
          sourceType: host === 'music.youtube.com' ? 'video' : 'video',
        };
      }

      if (listId) {
        return { kind: 'playlist', listId, sourceType: 'playlist' };
      }

      // Bare 11-character YouTube id (convenient for quick testing).
      if (/^[A-Za-z0-9_-]{11}$/.test(raw)) {
        return { kind: 'video', videoId: raw, sourceType: 'video' };
      }
    } catch {
      return null;
    }

    return null;
  }

  public async resolve(input: string): Promise<ResolvedMedia> {
    const info = this.parseUrl(input);
    if (!info) {
      throw new Error('That does not look like a YouTube video, Shorts, Music, or playlist link.');
    }

    if (info.kind === 'playlist' && info.listId) {
      return this.resolvePlaylist(info.listId, info.videoId);
    }

    if (!info.videoId) {
      throw new Error('Could not find a video id in that YouTube link.');
    }

    const item = await this.resolveVideo(info.videoId, info.sourceType);
    return {
      provider: 'youtube',
      sourceType: info.sourceType,
      title: item.title,
      artist: item.artist,
      thumbnail: item.thumbnail,
      items: [item],
      warning: item.isPlayable ? undefined : item.unavailabilityReason,
    };
  }

  private async resolveVideo(videoId: string, sourceType: MediaSourceType): Promise<MediaItemInput> {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const fallbackThumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    try {
      const oembed = await this.fetchJson<OEmbedResponse>(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
        6_000
      );

      const duration = await this.fetchDuration(videoId);

      return {
        provider: 'youtube',
        sourceType,
        mediaId: videoId,
        url: watchUrl,
        title: oembed.title || `YouTube video ${videoId}`,
        artist: oembed.author_name || 'YouTube',
        thumbnail: oembed.thumbnail_url || fallbackThumb,
        duration,
        isPlayable: true,
      };
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 404) {
        throw new Error('That YouTube video was not found or is private.');
      }
      if (status === 401 || status === 403) {
        return {
          provider: 'youtube',
          sourceType,
          mediaId: videoId,
          url: watchUrl,
          title: `YouTube video ${videoId}`,
          artist: 'YouTube',
          thumbnail: fallbackThumb,
          duration: await this.fetchDuration(videoId).catch(() => 0),
          isPlayable: false,
          unavailabilityReason:
            'This video does not allow embedding. The admin can skip it, or open it on YouTube.',
        };
      }

      // Network / oEmbed hiccup: still allow the IFrame API a chance to play it.
      return {
        provider: 'youtube',
        sourceType,
        mediaId: videoId,
        url: watchUrl,
        title: `YouTube video ${videoId}`,
        artist: 'YouTube',
        thumbnail: fallbackThumb,
        duration: 0,
        isPlayable: true,
      };
    }
  }

  private async resolvePlaylist(listId: string, preferredVideoId?: string): Promise<ResolvedMedia> {
    let entries: PlaylistEntry[] = [];
    let warning: string | undefined;

    if (this.apiKey) {
      entries = await this.fetchPlaylistViaDataApi(listId);
    }

    if (entries.length === 0) {
      try {
        entries = await this.fetchPlaylistViaFeed(listId);
        warning = this.apiKey
          ? undefined
          : 'Playlist expanded from YouTube’s public feed (latest items). Add YOUTUBE_API_KEY for full, ordered playlist expansion.';
      } catch {
        warning = '';
      }
    }

    if (entries.length === 0 && preferredVideoId) {
      const single = await this.resolveVideo(preferredVideoId, 'video');
      return {
        provider: 'youtube',
        sourceType: 'playlist',
        title: single.title,
        artist: single.artist,
        thumbnail: single.thumbnail,
        items: [single],
        warning:
          'The playlist could not be expanded, so only the linked video was added. Add YOUTUBE_API_KEY for full playlist support.',
      };
    }

    if (entries.length === 0) {
      throw new Error(
        'Could not read that YouTube playlist. Make sure it is public, or add YOUTUBE_API_KEY for reliable playlist support.'
      );
    }

    const items: MediaItemInput[] = entries.slice(0, 100).map((entry) => ({
      provider: 'youtube',
      sourceType: 'video',
      mediaId: entry.videoId,
      url: `https://www.youtube.com/watch?v=${entry.videoId}`,
      title: entry.title,
      artist: entry.artist,
      thumbnail: entry.thumbnail,
      duration: entry.duration,
      isPlayable: true,
    }));

    const first = items[0];
    return {
      provider: 'youtube',
      sourceType: 'playlist',
      title: `YouTube playlist · ${items.length} videos`,
      artist: first?.artist || 'YouTube',
      thumbnail: first?.thumbnail || '',
      items,
      warning:
        warning ||
        (entries.length > 100 ? 'Only the first 100 videos were added.' : undefined),
    };
  }

  private async fetchPlaylistViaDataApi(listId: string): Promise<PlaylistEntry[]> {
    let entries: PlaylistEntry[] = [];
    let pageToken = '';

    for (let page = 0; page < 2; page += 1) {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails',
        playlistId: listId,
        maxResults: '50',
        key: this.apiKey,
      });
      if (pageToken) params.set('pageToken', pageToken);

      const data = await this.fetchJson<{
        items?: Array<{
          snippet?: {
            title?: string;
            videoOwnerChannelTitle?: string;
            channelTitle?: string;
            thumbnails?: Record<string, { url?: string }>;
          };
          contentDetails?: { videoId?: string };
        }>;
        nextPageToken?: string;
      }>(`https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`, 8_000);

      const pageEntries = (data.items || [])
        .map((entry) => {
          const videoId = entry.contentDetails?.videoId;
          if (!videoId) return null;
          const thumbs = entry.snippet?.thumbnails || {};
          const thumbnail =
            thumbs.maxres?.url ||
            thumbs.standard?.url ||
            thumbs.high?.url ||
            thumbs.medium?.url ||
            thumbs.default?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

          return {
            videoId,
            title: entry.snippet?.title || `YouTube video ${videoId}`,
            artist:
              entry.snippet?.videoOwnerChannelTitle ||
              entry.snippet?.channelTitle ||
              'YouTube',
            thumbnail,
            duration: 0,
          } satisfies PlaylistEntry;
        })
        .filter((entry): entry is PlaylistEntry => entry !== null);

      entries.push(...pageEntries);
      pageToken = data.nextPageToken || '';
      if (!pageToken) break;
    }

    // Fill durations with a single batched videos.list call.
    if (entries.length > 0) {
      const ids = entries.map((entry) => entry.videoId).join(',');
      try {
        const data = await this.fetchJson<{
          items?: Array<{ id?: string; contentDetails?: { duration?: string } }>;
        }>(
          `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(
            ids
          )}&key=${this.apiKey}`,
          8_000
        );
        const durations = new Map(
          (data.items || []).map((item) => [
            item.id || '',
            isoDurationToSeconds(item.contentDetails?.duration),
          ])
        );
        entries = entries.map((entry) => ({
          ...entry,
          duration: durations.get(entry.videoId) || 0,
        }));
      } catch {
        // Durations are nice-to-have; the player will report them later.
      }
    }

    return entries;
  }

  private async fetchPlaylistViaFeed(listId: string): Promise<PlaylistEntry[]> {
    const response = await fetch(
      `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(listId)}`,
      {
        headers: { 'User-Agent': 'Vybe/1.0 (+https://vybe.app)' },
        signal: AbortSignal.timeout(7_000),
      }
    );
    if (!response.ok) throw new Error(`Playlist feed returned ${response.status}`);
    const xml = await response.text();

    const blocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    return blocks
      .map((block) => {
        const videoId = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
        if (!videoId) return null;
        const title =
          block.match(/<media:title>([\s\S]*?)<\/media:title>/)?.[1] ||
          block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ||
          `YouTube video ${videoId}`;
        const artist =
          block.match(/<media:credit[^>]*role="uploader"[^>]*>([\s\S]*?)<\/media:credit>/)?.[1] ||
          block.match(/<name>([\s\S]*?)<\/name>/)?.[1] ||
          'YouTube';
        const thumbnail =
          block.match(/<media:thumbnail url="([^"]+)"/)?.[1] ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        return {
          videoId,
          title: decodeXml(title).trim(),
          artist: decodeXml(artist).trim(),
          thumbnail: decodeXml(thumbnail),
          duration: 0,
        } satisfies PlaylistEntry;
      })
      .filter((entry): entry is PlaylistEntry => entry !== null);
  }

  private async fetchDuration(videoId: string): Promise<number> {
    if (this.apiKey) {
      try {
        const data = await this.fetchJson<{
          items?: Array<{ contentDetails?: { duration?: string } }>;
        }>(
          `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(
            videoId
          )}&key=${this.apiKey}`,
          6_000
        );
        const sec = isoDurationToSeconds(data.items?.[0]?.contentDetails?.duration);
        if (sec > 0) return sec;
      } catch {
        // Fall back to scraping
      }
    }

    try {
      const response = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) {
        const html = await response.text();
        const match = html.match(/"lengthSeconds":"(\d+)"/);
        if (match?.[1]) {
          const parsed = parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
      }
    } catch {
      // ignore
    }

    return 0;
  }

  private async fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Vybe/1.0 (+https://vybe.app)' },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const error = new Error(`Request failed with ${response.status}`) as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }

    return (await response.json()) as T;
  }
}
