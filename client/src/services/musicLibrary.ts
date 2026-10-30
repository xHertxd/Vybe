import type { MediaItemInput } from '../types.js';

export const CURATED_TRACKS: MediaItemInput[] = [
  // Full-length YouTube Tracks (Plays complete full songs without 30s limit)
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: '34Na4j8AVgA',
    url: 'https://www.youtube.com/watch?v=34Na4j8AVgA',
    title: 'Starboy (feat. Daft Punk)',
    artist: 'The Weeknd',
    album: 'Starboy',
    thumbnail: 'https://img.youtube.com/vi/34Na4j8AVgA/hqdefault.jpg',
    duration: 230,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: '4NRXx6U8ABQ',
    url: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    thumbnail: 'https://img.youtube.com/vi/4NRXx6U8ABQ/hqdefault.jpg',
    duration: 200,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: '5NV6Rdv1a3I',
    url: 'https://www.youtube.com/watch?v=5NV6Rdv1a3I',
    title: 'Get Lucky (feat. Pharrell Williams & Nile Rodgers)',
    artist: 'Daft Punk',
    album: 'Random Access Memories',
    thumbnail: 'https://img.youtube.com/vi/5NV6Rdv1a3I/hqdefault.jpg',
    duration: 248,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: 'dvgZkm1xWPE',
    url: 'https://www.youtube.com/watch?v=dvgZkm1xWPE',
    title: 'Viva La Vida',
    artist: 'Coldplay',
    album: 'Viva La Vida or Death and All His Friends',
    thumbnail: 'https://img.youtube.com/vi/dvgZkm1xWPE/hqdefault.jpg',
    duration: 242,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: 'TUVcZfQe-Kw',
    url: 'https://www.youtube.com/watch?v=TUVcZfQe-Kw',
    title: 'Levitating',
    artist: 'Dua Lipa',
    album: 'Future Nostalgia',
    thumbnail: 'https://img.youtube.com/vi/TUVcZfQe-Kw/hqdefault.jpg',
    duration: 203,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: 'ApXoWvfEYVU',
    url: 'https://www.youtube.com/watch?v=ApXoWvfEYVU',
    title: 'Sunflower (Spider-Man: Into the Spider-Verse)',
    artist: 'Post Malone & Swae Lee',
    album: 'Hollywood\'s Bleeding',
    thumbnail: 'https://img.youtube.com/vi/ApXoWvfEYVU/hqdefault.jpg',
    duration: 158,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: 'dX3k_QDnzHE',
    url: 'https://www.youtube.com/watch?v=dX3k_QDnzHE',
    title: 'Midnight City',
    artist: 'M83',
    album: 'Hurry Up, We\'re Dreaming',
    thumbnail: 'https://img.youtube.com/vi/dX3k_QDnzHE/hqdefault.jpg',
    duration: 243,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: '7wtfhZwyrcc',
    url: 'https://www.youtube.com/watch?v=7wtfhZwyrcc',
    title: 'Believer',
    artist: 'Imagine Dragons',
    album: 'Evolve',
    thumbnail: 'https://img.youtube.com/vi/7wtfhZwyrcc/hqdefault.jpg',
    duration: 204,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: 'jfKfPfyJRdk',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    title: 'lofi hip hop radio - beats to relax/study to',
    artist: 'Lofi Girl',
    album: 'Live Radio',
    thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    duration: 3600,
    isPlayable: true,
  },

  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: 'kJQP7kiw5Fk',
    url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
    title: 'Despacito (feat. Daddy Yankee)',
    artist: 'Luis Fonsi',
    album: 'VIDA',
    thumbnail: 'https://img.youtube.com/vi/kJQP7kiw5Fk/hqdefault.jpg',
    duration: 282,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: 'JGwWNGJdvx8',
    url: 'https://www.youtube.com/watch?v=JGwWNGJdvx8',
    title: 'Shape of You',
    artist: 'Ed Sheeran',
    album: '÷ (Divide)',
    thumbnail: 'https://img.youtube.com/vi/JGwWNGJdvx8/hqdefault.jpg',
    duration: 234,
    isPlayable: true,
  },
];

interface ITunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100: string;
  previewUrl: string;
  trackTimeMillis: number;
}

export async function searchSongs(query: string): Promise<MediaItemInput[]> {
  const clean = query.trim();
  if (!clean) return CURATED_TRACKS;

  const matchedCurated = CURATED_TRACKS.filter(
    (t) =>
      t.title.toLowerCase().includes(clean.toLowerCase()) ||
      t.artist.toLowerCase().includes(clean.toLowerCase())
  );

  // 1. Try backend YouTube search (full songs, no 30s limit)
  try {
    const serverUrl = import.meta.env.VITE_SERVER_URL || '';
    const res = await fetch(`${serverUrl}/api/search?q=${encodeURIComponent(clean)}`, {
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) {
      const data = (await res.json()) as { success?: boolean; results?: MediaItemInput[] };
      if (data.success && data.results && data.results.length > 0) {
        return data.results;
      }
    }
  } catch {
    // Backend search offline or timed out, continue to fallback
  }

  // 2. Return matched curated songs if any
  if (matchedCurated.length > 0) {
    return matchedCurated;
  }

  // 3. iTunes search fallback
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
      clean
    )}&entity=song&limit=15`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Search failed');

    const data = (await res.json()) as { results?: ITunesTrack[] };
    const results = data.results || [];

    const items: MediaItemInput[] = results
      .filter((t) => Boolean(t.previewUrl && t.trackName))
      .map((t) => {
        const hdArtwork = t.artworkUrl100
          ? t.artworkUrl100.replace('100x100bb', '600x600bb')
          : '';
        return {
          provider: 'audio' as const,
          sourceType: 'track' as const,
          mediaId: String(t.trackId),
          url: t.previewUrl,
          title: t.trackName,
          artist: t.artistName || 'Unknown Artist',
          album: t.collectionName || '',
          thumbnail: hdArtwork,
          duration: 30,
          isPlayable: true,
        };
      });

    return items;
  } catch {
    return CURATED_TRACKS;
  }
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
  const match = clean.match(/spotify(?:\.com)?(?:\/track|\:track)[\/:]([a-zA-Z0-9]{22})/);
  return match ? match[1] : null;
}

export async function resolveDirectMedia(url: string): Promise<MediaItemInput> {
  const clean = url.trim();

  // 1. YouTube
  const ytId = extractYouTubeId(clean);
  if (ytId) {
    let title = 'YouTube Track';
    let author = 'YouTube';
    let thumbnail = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`
      );
      if (res.ok) {
        const meta = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
        if (meta.title) title = meta.title;
        if (meta.author_name) author = meta.author_name;
        if (meta.thumbnail_url) thumbnail = meta.thumbnail_url;
      }
    } catch {
      // Use fallback defaults
    }

    return {
      provider: 'youtube',
      sourceType: 'video',
      mediaId: ytId,
      url: `https://www.youtube.com/watch?v=${ytId}`,
      title,
      artist: author,
      thumbnail,
      duration: 210,
      isPlayable: true,
    };
  }

  // 2. Spotify
  const spotId = extractSpotifyId(clean);
  if (spotId) {
    let title = 'Spotify Track';
    let author = 'Spotify';
    let thumbnail = '';

    try {
      const res = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${spotId}`);
      if (res.ok) {
        const meta = (await res.json()) as { title?: string; thumbnail_url?: string };
        if (meta.title) {
          const parts = meta.title.split(' - ');
          if (parts.length > 1) {
            author = parts[0];
            title = parts.slice(1).join(' - ');
          } else {
            title = meta.title;
          }
        }
        if (meta.thumbnail_url) thumbnail = meta.thumbnail_url;
      }
    } catch {
      // Use fallback defaults
    }

    return {
      provider: 'spotify',
      sourceType: 'track',
      mediaId: spotId,
      url: `https://open.spotify.com/track/${spotId}`,
      title,
      artist: author,
      thumbnail,
      duration: 180,
      isPlayable: true,
    };
  }

  // 3. Direct Audio URL
  const filename = clean.split('/').pop()?.split('?')[0] || 'Audio Track';
  return {
    provider: 'audio',
    sourceType: 'track',
    mediaId: 'direct_' + Math.random().toString(36).slice(2, 9),
    url: clean,
    title: decodeURIComponent(filename),
    artist: 'Direct Stream',
    thumbnail: '',
    duration: 180,
    isPlayable: true,
  };
}
