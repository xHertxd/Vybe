import type { MediaItemInput, MediaSourceType, ResolvedMedia } from '../types.js';

type SpotifyKind = 'track' | 'album' | 'playlist';

interface SpotifyImage {
  url?: string;
  width?: number;
  height?: number;
}

interface SpotifyArtist {
  name?: string;
}

interface SpotifyAlbum {
  name?: string;
  images?: SpotifyImage[];
}

interface SpotifyTrack {
  id?: string;
  name?: string;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
  duration_ms?: number;
  external_urls?: { spotify?: string };
}

interface SpotifyResolveInfo {
  kind: SpotifyKind;
  id: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

const FALLBACK_ART =
  'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=600&auto=format&fit=crop&q=80';

function parseOEmbedTitle(raw: string): { title: string; artist: string } {
  let title = raw.trim();
  let artist = 'Spotify';

  const byMatch = title.match(/^(.*?)\s+-\s+(?:song|album|playlist)\s+by\s+(.*?)(?:\s*\|\s*Spotify)?$/i);
  if (byMatch) {
    title = byMatch[1].trim();
    artist = byMatch[2].trim();
  } else {
    const fallback = title.split(' - ')[0];
    if (fallback) title = fallback.trim();
  }

  return { title: title.replace(/\s*\|\s*Spotify$/i, '').trim(), artist };
}

export class SpotifyIntegration {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly clientId = '',
    private readonly clientSecret = ''
  ) {}

  public isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  public parseUrl(input: string): SpotifyResolveInfo | null {
    const raw = input.trim();
    if (!raw) return null;

    const uriMatch = raw.match(/^spotify:(track|album|playlist):([A-Za-z0-9]+)/);
    if (uriMatch) {
      return { kind: uriMatch[1] as SpotifyKind, id: uriMatch[2] };
    }

    try {
      const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      if (!/spotify\.com$/i.test(url.hostname.replace(/^www\./i, ''))) return null;
      const pathMatch = url.pathname.match(/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/i);
      if (!pathMatch) return null;
      return { kind: pathMatch[1].toLowerCase() as SpotifyKind, id: pathMatch[2] };
    } catch {
      return null;
    }
  }

  public async resolve(input: string): Promise<ResolvedMedia> {
    const info = this.parseUrl(input);
    if (!info) {
      throw new Error('That does not look like a Spotify track, album, or playlist link.');
    }

    const standardUrl = `https://open.spotify.com/${info.kind}/${info.id}`;

    if (!this.isConfigured()) {
      return this.resolveWithoutCredentials(info, standardUrl);
    }

    try {
      if (info.kind === 'track') {
        const track = await this.apiGet<SpotifyTrack>(`/tracks/${info.id}`);
        const item = this.mapTrack(track, standardUrl);
        if (!item) throw new Error('That Spotify track is unavailable.');
        return {
          provider: 'spotify',
          sourceType: 'track',
          title: item.title,
          artist: item.artist,
          thumbnail: item.thumbnail,
          items: [item],
          warning:
            'Spotify playback only works on devices where the listener has connected a Spotify Premium account.',
        };
      }

      if (info.kind === 'album') {
        const album = await this.apiGet<{
          name?: string;
          images?: SpotifyImage[];
          artists?: SpotifyArtist[];
          tracks?: { items?: SpotifyTrack[]; next?: string | null };
          external_urls?: { spotify?: string };
        }>(`/albums/${info.id}`);
        const albumName = album.name || 'Spotify album';
        const albumArt = this.pickImage(album.images) || FALLBACK_ART;
        const items = (album.tracks?.items || [])
          .map((track) => this.mapTrack(track, undefined, albumName, albumArt))
          .filter((item): item is MediaItemInput => item !== null);

        if (items.length === 0) throw new Error('This Spotify album has no playable tracks.');

        return {
          provider: 'spotify',
          sourceType: 'album',
          title: albumName,
          artist: (album.artists || []).map((artist) => artist.name).filter(Boolean).join(', ') || 'Spotify',
          thumbnail: albumArt,
          items,
          warning:
            'Spotify playback requires each listener to connect a Spotify Premium account in the room.',
        };
      }

      const playlist = await this.apiGet<{
        name?: string;
        images?: SpotifyImage[];
        owner?: { display_name?: string };
        tracks?: {
          items?: Array<{ track?: SpotifyTrack | null }>;
          next?: string | null;
        };
      }>(
        `/playlists/${info.id}?fields=name,images,owner(display_name),tracks.items(track(id,name,artists,album(name,images),duration_ms,external_urls)),tracks.next`
      );

      const playlistName = playlist.name || 'Spotify playlist';
      const playlistArt = this.pickImage(playlist.images) || FALLBACK_ART;
      const items = (playlist.tracks?.items || [])
        .map((entry) =>
          this.mapTrack(entry.track || undefined, undefined, playlistName, playlistArt)
        )
        .filter((item): item is MediaItemInput => item !== null);

      if (items.length === 0) throw new Error('This Spotify playlist has no playable tracks.');

      return {
        provider: 'spotify',
        sourceType: 'playlist',
        title: playlistName,
        artist: playlist.owner?.display_name || 'Spotify',
        thumbnail: playlistArt,
        items,
        warning:
          'Spotify playback requires each listener to connect a Spotify Premium account in the room.',
      };
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 404) {
        throw new Error('That Spotify item was not found or is unavailable in this region.');
      }
      if (status === 401 || status === 403) {
        throw new Error('Spotify credentials were rejected. Check the configured client id and secret.');
      }
      if (status === 429) {
        throw new Error('Spotify is rate limiting metadata requests right now. Try again in a moment.');
      }
      if (error instanceof Error && error.message) throw error;
      throw new Error('Could not retrieve that Spotify link.');
    }
  }

  private async resolveWithoutCredentials(
    info: SpotifyResolveInfo,
    standardUrl: string
  ): Promise<ResolvedMedia> {
    let title = `Spotify ${info.kind}`;
    let artist = 'Spotify';
    let thumbnail = FALLBACK_ART;

    try {
      const response = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(standardUrl)}`,
        {
          headers: { 'User-Agent': 'Vybe/1.0 (+https://vybe.app)' },
          signal: AbortSignal.timeout(6_000),
        }
      );
      if (response.ok) {
        const data = (await response.json()) as { title?: string; thumbnail_url?: string };
        const parsed = parseOEmbedTitle(data.title || '');
        title = parsed.title || title;
        artist = parsed.artist || artist;
        thumbnail = data.thumbnail_url || thumbnail;
      } else if (response.status === 404) {
        throw new Error('That Spotify link was not found.');
      }
    } catch (error) {
      if (error instanceof Error && /not found/i.test(error.message)) throw error;
      // Keep the link addable even if oEmbed is unavailable.
    }

    const item: MediaItemInput = {
      provider: 'spotify',
      sourceType: info.kind,
      mediaId: info.id,
      url: standardUrl,
      title,
      artist,
      thumbnail,
      duration: 0,
      album: info.kind === 'album' ? title : undefined,
      isPlayable: true,
      unavailabilityReason:
        'Full Spotify playlists/albums need SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the server. Playback also requires each listener to connect a Spotify Premium account.',
    };

    return {
      provider: 'spotify',
      sourceType: info.kind,
      title,
      artist,
      thumbnail,
      items: [item],
      warning:
        'Spotify metadata is limited because server credentials are not configured. Playback requires a connected Spotify Premium account.',
    };
  }

  private mapTrack(
    track: SpotifyTrack | undefined,
    fallbackUrl?: string,
    fallbackAlbum?: string,
    fallbackArt?: string
  ): MediaItemInput | null {
    if (!track?.id || !track.name) return null;

    const albumName = track.album?.name || fallbackAlbum;
    const thumbnail =
      this.pickImage(track.album?.images) || fallbackArt || FALLBACK_ART;
    const artist =
      (track.artists || []).map((entry) => entry.name).filter(Boolean).join(', ') || 'Spotify';

    return {
      provider: 'spotify',
      sourceType: 'track',
      mediaId: track.id,
      url:
        track.external_urls?.spotify ||
        fallbackUrl ||
        `https://open.spotify.com/track/${track.id}`,
      title: track.name,
      artist,
      album: albumName,
      thumbnail,
      duration: Math.max(0, Math.round((track.duration_ms || 0) / 1000)),
      isPlayable: true,
    };
  }

  private pickImage(images?: SpotifyImage[]): string | undefined {
    if (!images || images.length === 0) return undefined;
    const sorted = [...images].sort((a, b) => (b.width || 0) - (a.width || 0));
    return sorted[0]?.url;
  }

  private async apiGet<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Vybe/1.0 (+https://vybe.app)',
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      if (response.status === 401) this.token = null;
      const error = new Error(`Spotify request failed with ${response.status}`) as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }

    return (await response.json()) as T;
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      const error = new Error(`Spotify token request failed with ${response.status}`) as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }

    const data = (await response.json()) as TokenResponse;
    if (!data.access_token) throw new Error('Spotify did not return an access token.');

    this.token = data.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(60, (data.expires_in || 3600) - 60) * 1000;
    return this.token;
  }
}

export type { SpotifyKind, MediaSourceType };
