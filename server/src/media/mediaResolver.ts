import { UnifiedMediaItem, MediaProvider } from '../types.js';
import crypto from 'crypto';

export interface ResolvedMediaInfo {
  provider: MediaProvider;
  mediaId: string;
  url: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  album?: string;
  isPlayable: boolean;
  unavailabilityReason?: string;
}

// Built-in royalty-free preset tracks for immediate out-of-the-box synchronized testing
export const PRESET_TRACKS: Omit<UnifiedMediaItem, 'id' | 'addedBy' | 'addedAt'>[] = [
  {
    provider: 'direct',
    mediaId: 'preset-lofi-night',
    url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
    title: 'Midnight Chill (Lo-Fi)',
    artist: 'FASSounds',
    album: 'Vybe Night Sessions',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
    duration: 147,
    isPlayable: true
  },
  {
    provider: 'direct',
    mediaId: 'preset-synthwave-neon',
    url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=neon-gaming-108740.mp3',
    title: 'Neon Horizon (Synthwave)',
    artist: 'AlexiAction',
    album: 'Retro Future Vol. 1',
    thumbnail: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500&auto=format&fit=crop&q=80',
    duration: 138,
    isPlayable: true
  },
  {
    provider: 'direct',
    mediaId: 'preset-cyber-beats',
    url: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=electronic-future-beats-117997.mp3',
    title: 'Cyber Drift (Electro)',
    artist: 'QubeSounds',
    album: 'Digital Pulse',
    thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
    duration: 162,
    isPlayable: true
  },
  {
    provider: 'youtube',
    mediaId: 'jfKfPfyJRdk',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    title: 'lofi hip hop radio 📚 - beats to relax/study to',
    artist: 'Lofi Girl',
    thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    duration: 3600,
    isPlayable: true
  }
];

export class MediaResolver {
  /**
   * Detects the media provider from the given URL.
   */
  static identifyProvider(input: string): MediaProvider | 'unknown' {
    const trimmed = input.trim();

    if (
      trimmed.includes('youtube.com') ||
      trimmed.includes('youtu.be') ||
      trimmed.includes('music.youtube.com')
    ) {
      return 'youtube';
    }

    if (trimmed.includes('spotify.com') || trimmed.startsWith('spotify:')) {
      return 'spotify';
    }

    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('/uploads/')
    ) {
      if (
        trimmed.match(/\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i) ||
        trimmed.includes('/uploads/')
      ) {
        return trimmed.includes('/uploads/') ? 'upload' : 'direct';
      }
      // General direct audio URL fallback
      return 'direct';
    }

    return 'unknown';
  }

  /**
   * Extract YouTube Video ID from any YouTube URL format.
   */
  static extractYouTubeId(url: string): string | null {
    try {
      // Clean up whitespace
      const cleanUrl = url.trim();

      // youtu.be/ID
      const shortMatch = cleanUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      if (shortMatch) return shortMatch[1];

      // youtube.com/shorts/ID
      const shortsMatch = cleanUrl.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return shortsMatch[1];

      // youtube.com/embed/ID
      const embedMatch = cleanUrl.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];

      // Standard youtube.com/watch?v=ID or music.youtube.com/watch?v=ID
      const urlObj = new URL(cleanUrl);
      const v = urlObj.searchParams.get('v');
      if (v && v.length === 11) return v;

      // Check path segment if directly 11 chars
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      for (const part of pathParts) {
        if (part.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(part)) {
          return part;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract Spotify ID and type from Spotify URL.
   */
  static extractSpotifyInfo(url: string): { type: 'track' | 'album' | 'playlist'; id: string } | null {
    try {
      const cleanUrl = url.trim();

      // spotify:track:ID or spotify:album:ID
      const uriMatch = cleanUrl.match(/^spotify:(track|album|playlist):([a-zA-Z0-9]+)/);
      if (uriMatch) {
        return { type: uriMatch[1] as any, id: uriMatch[2] };
      }

      // open.spotify.com/(track|album|playlist)/ID
      const urlMatch = cleanUrl.match(/spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
      if (urlMatch) {
        return { type: urlMatch[1] as any, id: urlMatch[2] };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Resolves YouTube video metadata using oEmbed.
   */
  static async resolveYouTube(url: string): Promise<ResolvedMediaInfo> {
    const videoId = this.extractYouTubeId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL: Could not extract a valid 11-character video ID.');
    }

    const defaultThumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
      // Use YouTube official oEmbed endpoint (no API key required)
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(standardUrl)}&format=json`;
      const response = await fetch(oembedUrl, {
        headers: { 'User-Agent': 'Vybe-Sync-App/1.0' },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return {
            provider: 'youtube',
            mediaId: videoId,
            url: standardUrl,
            title: `YouTube Video (${videoId})`,
            artist: 'YouTube',
            thumbnail: defaultThumbnail,
            duration: 240,
            isPlayable: false,
            unavailabilityReason: 'Embedding is disabled for this YouTube video by the creator or copyright owner.'
          };
        }
        if (response.status === 404) {
          throw new Error('YouTube video not found or is set to private.');
        }
      }

      const data = await response.json() as any;
      return {
        provider: 'youtube',
        mediaId: videoId,
        url: standardUrl,
        title: data.title || `YouTube Video (${videoId})`,
        artist: data.author_name || 'YouTube Creator',
        thumbnail: data.thumbnail_url || defaultThumbnail,
        duration: 210, // Default duration estimate, client player updates to precise duration upon load
        isPlayable: true
      };
    } catch (err: any) {
      // Fallback if oEmbed times out or fails
      return {
        provider: 'youtube',
        mediaId: videoId,
        url: standardUrl,
        title: `YouTube Video (${videoId})`,
        artist: 'YouTube Creator',
        thumbnail: defaultThumbnail,
        duration: 210,
        isPlayable: true
      };
    }
  }

  /**
   * Resolves Spotify metadata using official Spotify oEmbed endpoint.
   */
  static async resolveSpotify(url: string): Promise<ResolvedMediaInfo> {
    const spotifyInfo = this.extractSpotifyInfo(url);
    if (!spotifyInfo) {
      throw new Error('Invalid Spotify link: Could not recognize track, album, or playlist.');
    }

    const standardUrl = `https://open.spotify.com/${spotifyInfo.type}/${spotifyInfo.id}`;

    try {
      // Official Spotify oEmbed
      const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(standardUrl)}`;
      const response = await fetch(oembedUrl, {
        headers: { 'User-Agent': 'Vybe-Sync-App/1.0' },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Spotify metadata retrieval returned ${response.status}`);
      }

      const data = await response.json() as any;
      
      // Parse Title and Artist from Spotify title format, typically: "Song Title by Artist" or "Song Title - song by Artist | Spotify"
      let title = data.title || 'Spotify Track';
      let artist = 'Spotify Artist';

      if (title.includes(' - song by ')) {
        const parts = title.split(' - song by ');
        title = parts[0].trim();
        artist = parts[1].replace(' | Spotify', '').trim();
      } else if (title.includes(' by ')) {
        const parts = title.split(' by ');
        title = parts[0].trim();
        artist = parts[1].replace(' | Spotify', '').trim();
      }

      return {
        provider: 'spotify',
        mediaId: spotifyInfo.id,
        url: standardUrl,
        title,
        artist,
        album: spotifyInfo.type === 'album' ? title : undefined,
        thumbnail: data.thumbnail_url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=500&auto=format&fit=crop&q=80',
        duration: 210,
        isPlayable: true
      };
    } catch (err: any) {
      return {
        provider: 'spotify',
        mediaId: spotifyInfo.id,
        url: standardUrl,
        title: `${spotifyInfo.type.toUpperCase()}: ${spotifyInfo.id}`,
        artist: 'Spotify',
        thumbnail: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=500&auto=format&fit=crop&q=80',
        duration: 210,
        isPlayable: true
      };
    }
  }

  /**
   * Resolves Direct Audio URL or uploaded file.
   */
  static async resolveDirectAudio(url: string, isUpload = false): Promise<ResolvedMediaInfo> {
    try {
      const urlObj = new URL(url, 'http://localhost:5000');
      const filename = decodeURIComponent(urlObj.pathname.split('/').pop() || 'Audio Track');
      const cleanTitle = filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

      return {
        provider: isUpload ? 'upload' : 'direct',
        mediaId: crypto.randomUUID(),
        url,
        title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
        artist: isUpload ? 'Local Upload' : 'Web Stream',
        thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80',
        duration: 180, // Will be updated by audio element on load
        isPlayable: true
      };
    } catch {
      return {
        provider: isUpload ? 'upload' : 'direct',
        mediaId: crypto.randomUUID(),
        url,
        title: 'Direct Audio Track',
        artist: 'Vybe Audio',
        thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80',
        duration: 180,
        isPlayable: true
      };
    }
  }

  /**
   * Main resolver entry point.
   */
  static async resolve(url: string): Promise<ResolvedMediaInfo> {
    const provider = this.identifyProvider(url);

    if (provider === 'youtube') {
      return this.resolveYouTube(url);
    }

    if (provider === 'spotify') {
      return this.resolveSpotify(url);
    }

    if (provider === 'direct' || provider === 'upload') {
      return this.resolveDirectAudio(url, provider === 'upload');
    }

    throw new Error('Unsupported media URL. Please provide a valid YouTube video/music URL, Spotify track link, or direct audio link (.mp3, .wav, etc.).');
  }
}
