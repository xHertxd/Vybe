import crypto from 'crypto';
import path from 'path';
import type { MediaItemInput, MediaProvider, ResolvedMedia } from '../types.js';
import { YouTubeIntegration } from './youtubeIntegration.js';
import { SpotifyIntegration } from './spotifyIntegration.js';

const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|oga|aac|m4a|flac|opus|webm)(\?.*)?$/i;

export const PRESET_TRACKS: Array<Omit<MediaItemInput, 'isPlayable'>> = [
  {
    provider: 'audio',
    sourceType: 'url',
    mediaId: 'preset-neon-drift',
    url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=neon-gaming-108740.mp3',
    title: 'Neon Horizon',
    artist: 'AlexiAction',
    album: 'Retro Future Vol. 1',
    thumbnail:
      'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=900&auto=format&fit=crop&q=80',
    duration: 138,
  },
  {
    provider: 'audio',
    sourceType: 'url',
    mediaId: 'preset-midnight-chill',
    url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
    title: 'Midnight Chill',
    artist: 'FASSounds',
    album: 'Vybe Night Sessions',
    thumbnail:
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=900&auto=format&fit=crop&q=80',
    duration: 147,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: 'jfKfPfyJRdk',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    title: 'lofi hip hop radio — beats to relax/study to',
    artist: 'Lofi Girl',
    thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    duration: 0,
  },
];

export class MediaResolver {
  private readonly youtube: YouTubeIntegration;
  private readonly spotify: SpotifyIntegration;

  constructor(youtubeApiKey = '', spotifyClientId = '', spotifyClientSecret = '') {
    this.youtube = new YouTubeIntegration(youtubeApiKey);
    this.spotify = new SpotifyIntegration(spotifyClientId, spotifyClientSecret);
  }

  public capabilities(): {
    youtubePlaylists: boolean;
    spotifyMetadata: boolean;
    youtubeApi: boolean;
  } {
    return {
      youtubePlaylists: this.youtube.canExpandPlaylists(),
      spotifyMetadata: this.spotify.isConfigured(),
      youtubeApi: this.youtube.canExpandPlaylists(),
    };
  }

  public identifyProvider(input: string): MediaProvider | 'unknown' {
    const raw = input.trim();
    if (!raw) return 'unknown';

    if (this.youtube.parseUrl(raw)) return 'youtube';
    if (this.spotify.parseUrl(raw)) return 'spotify';

    if (raw.startsWith('/uploads/')) return 'audio';

    try {
      const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'unknown';
      if (AUDIO_EXTENSIONS.test(url.pathname)) return 'audio';
    } catch {
      return 'unknown';
    }

    return 'unknown';
  }

  public async resolve(input: string): Promise<ResolvedMedia> {
    const raw = input.trim();
    const provider = this.identifyProvider(raw);

    if (provider === 'youtube') {
      return this.youtube.resolve(raw);
    }

    if (provider === 'spotify') {
      return this.spotify.resolve(raw);
    }

    if (provider === 'audio') {
      return this.resolveAudio(raw);
    }

    throw new Error(
      'Unsupported link. Paste a YouTube video/Shorts/Music/playlist link, a Spotify track/album/playlist link, or a direct audio URL ending in .mp3, .wav, .ogg, .m4a, or .flac.'
    );
  }

  public resolveUploadedFile(fileName: string, publicPath: string): MediaItemInput {
    const base = path.parse(fileName).name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const title = base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Uploaded audio';

    return {
      provider: 'audio',
      sourceType: 'upload',
      mediaId: crypto.randomUUID(),
      url: publicPath,
      title,
      artist: 'Uploaded file',
      thumbnail:
        'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=900&auto=format&fit=crop&q=80',
      duration: 0,
      isPlayable: true,
    };
  }

  private resolveAudio(raw: string): ResolvedMedia {
    if (raw.startsWith('/uploads/')) {
      const name = decodeURIComponent(raw.split('/').pop() || 'Uploaded audio');
      const item = this.resolveUploadedFile(name, raw);
      return {
        provider: 'audio',
        sourceType: 'upload',
        title: item.title,
        artist: item.artist,
        thumbnail: item.thumbnail,
        items: [item],
      };
    }

    const url = new URL(raw);
    if (!AUDIO_EXTENSIONS.test(url.pathname)) {
      throw new Error(
        'That URL does not end in a supported audio extension. Use a direct .mp3, .wav, .ogg, .m4a, or .flac link.'
      );
    }

    const fileName = decodeURIComponent(url.pathname.split('/').pop() || 'Audio track');
    const base = path.parse(fileName).name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const title = base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Audio track';

    const item: MediaItemInput = {
      provider: 'audio',
      sourceType: 'url',
      mediaId: crypto.createHash('sha1').update(url.toString()).digest('hex').slice(0, 16),
      url: url.toString(),
      title,
      artist: url.hostname.replace(/^www\./, ''),
      thumbnail:
        'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=900&auto=format&fit=crop&q=80',
      duration: 0,
      isPlayable: true,
    };

    return {
      provider: 'audio',
      sourceType: 'url',
      title,
      artist: item.artist,
      thumbnail: item.thumbnail,
      items: [item],
    };
  }
}
