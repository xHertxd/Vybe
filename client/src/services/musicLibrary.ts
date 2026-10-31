import type { MediaItemInput } from '../types.js';
import { getApiUrl } from './socket.js';

export const CURATED_TRACKS: MediaItemInput[] = [
  // --- FreeToUse Music Library (High Fidelity Royalty-Free MP3 Streams - Instant start, zero ads, BeatSync) ---
  {
    provider: 'audio',
    sourceType: 'track',
    mediaId: 'freetouse_60974ab4-afa7-211d-3ffc-09fdbaff8e58',
    url: 'https://eu.data.freetouse.com/music/tracks/60974ab4-afa7-211d-3ffc-09fdbaff8e58/file/mp3/file.mp3',
    title: 'Enlivening',
    artist: 'Pufino',
    album: 'Electronic · Free To Use',
    thumbnail: 'https://eu.data.freetouse.com/music/tracks/60974ab4-afa7-211d-3ffc-09fdbaff8e58/cover/webp/md/cover-md.webp',
    duration: 153,
    isPlayable: true,
  },
  {
    provider: 'audio',
    sourceType: 'track',
    mediaId: 'freetouse_8a530b0e-0b17-79c0-0aa9-ba19abff4ad3',
    url: 'https://eu.data.freetouse.com/music/tracks/8a530b0e-0b17-79c0-0aa9-ba19abff4ad3/file/mp3/file.mp3',
    title: 'Last Summer',
    artist: 'Aylex',
    album: 'Electronic · Free To Use',
    thumbnail: 'https://eu.data.freetouse.com/music/tracks/8a530b0e-0b17-79c0-0aa9-ba19abff4ad3/cover/webp/md/cover-md.webp',
    duration: 173,
    isPlayable: true,
  },
  {
    provider: 'audio',
    sourceType: 'track',
    mediaId: 'freetouse_9979b59f-d2e4-442f-a893-39c2e81f8b4f',
    url: 'https://eu.data.freetouse.com/music/tracks/9979b59f-d2e4-442f-a893-39c2e81f8b4f/file/mp3/file.mp3',
    title: 'Nothing',
    artist: 'Damtaro',
    album: 'Electronic · Free To Use',
    thumbnail: 'https://eu.data.freetouse.com/music/tracks/9979b59f-d2e4-442f-a893-39c2e81f8b4f/cover/webp/md/cover-md.webp',
    duration: 199,
    isPlayable: true,
  },
  {
    provider: 'audio',
    sourceType: 'track',
    mediaId: 'freetouse_fc95e0bb-e942-4c4b-874b-a194fd200cf3',
    url: 'https://eu.data.freetouse.com/music/tracks/fc95e0bb-e942-4c4b-874b-a194fd200cf3/file/mp3/file.mp3',
    title: 'Akaneiro',
    artist: 'Johny Grimes',
    album: 'Chill · Free To Use',
    thumbnail: 'https://eu.data.freetouse.com/music/tracks/fc95e0bb-e942-4c4b-874b-a194fd200cf3/cover/webp/md/cover-md.webp',
    duration: 126,
    isPlayable: true,
  },
  {
    provider: 'audio',
    sourceType: 'track',
    mediaId: 'freetouse_253bde6c-990f-47d3-94a4-5c2595cc4b32',
    url: 'https://eu.data.freetouse.com/music/tracks/253bde6c-990f-47d3-94a4-5c2595cc4b32/file/mp3/file.mp3',
    title: 'Lighthearted',
    artist: 'Zambolino',
    album: 'Chill · Free To Use',
    thumbnail: 'https://eu.data.freetouse.com/music/tracks/253bde6c-990f-47d3-94a4-5c2595cc4b32/cover/webp/md/cover-md.webp',
    duration: 154,
    isPlayable: true,
  },
  {
    provider: 'audio',
    sourceType: 'track',
    mediaId: 'freetouse_bb28e71c-5e67-49f3-a2fe-04f227b05de3',
    url: 'https://eu.data.freetouse.com/music/tracks/bb28e71c-5e67-49f3-a2fe-04f227b05de3/file/mp3/file.mp3',
    title: 'Feathers',
    artist: 'Zambolino',
    album: 'Folk Acoustic · Free To Use',
    thumbnail: 'https://eu.data.freetouse.com/music/tracks/bb28e71c-5e67-49f3-a2fe-04f227b05de3/cover/webp/md/cover-md.webp',
    duration: 143,
    isPlayable: true,
  },
  {
    provider: 'audio',
    sourceType: 'track',
    mediaId: 'freetouse_e0f78f6d-3922-5272-2291-89120e4eaa6d',
    url: 'https://eu.data.freetouse.com/music/tracks/e0f78f6d-3922-5272-2291-89120e4eaa6d/file/mp3/file.mp3',
    title: 'Maui',
    artist: 'Hazelwood',
    album: 'Electronic · Free To Use',
    thumbnail: 'https://eu.data.freetouse.com/music/tracks/e0f78f6d-3922-5272-2291-89120e4eaa6d/cover/webp/md/cover-md.webp',
    duration: 138,
    isPlayable: true,
  },
  {
    provider: 'audio',
    sourceType: 'track',
    mediaId: 'freetouse_743cfa46-c6b4-28f7-0436-ee5d5d6055ff',
    url: 'https://eu.data.freetouse.com/music/tracks/743cfa46-c6b4-28f7-0436-ee5d5d6055ff/file/mp3/file.mp3',
    title: 'Building Dreams',
    artist: 'Aylex',
    album: 'Electronic · Free To Use',
    thumbnail: 'https://eu.data.freetouse.com/music/tracks/743cfa46-c6b4-28f7-0436-ee5d5d6055ff/cover/webp/md/cover-md.webp',
    duration: 126,
    isPlayable: true,
  },
  {
    provider: 'audio',
    sourceType: 'url',
    mediaId: 'somafm_groovesalad',
    url: 'https://ice6.somafm.com/groovesalad-128-mp3',
    title: 'Groove Salad (24/7 Live Ambient)',
    artist: 'SomaFM Lounge',
    album: 'Live Audio Stream',
    thumbnail: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80',
    duration: 0,
    isPlayable: true,
  },
  {
    provider: 'audio',
    sourceType: 'url',
    mediaId: 'somafm_defcon',
    url: 'https://ice4.somafm.com/defcon-128-mp3',
    title: 'DefCon Underground (24/7 Electronic)',
    artist: 'SomaFM Beats',
    album: 'Live Audio Stream',
    thumbnail: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&auto=format&fit=crop&q=80',
    duration: 0,
    isPlayable: true,
  },

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
    mediaId: 'YykjpeuMNEk',
    url: 'https://www.youtube.com/watch?v=YykjpeuMNEk',
    title: 'Hymn For The Weekend',
    artist: 'Coldplay',
    album: 'A Head Full of Dreams',
    thumbnail: 'https://img.youtube.com/vi/YykjpeuMNEk/hqdefault.jpg',
    duration: 260,
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
    mediaId: 'JGwWNGJdvx8',
    url: 'https://www.youtube.com/watch?v=JGwWNGJdvx8',
    title: 'Shape of You',
    artist: 'Ed Sheeran',
    album: '÷ (Divide)',
    thumbnail: 'https://img.youtube.com/vi/JGwWNGJdvx8/hqdefault.jpg',
    duration: 234,
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
    mediaId: 'fJ9rUzIMcZQ',
    url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    thumbnail: 'https://img.youtube.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
    duration: 359,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: 'OPf0YbXqDm0',
    url: 'https://www.youtube.com/watch?v=OPf0YbXqDm0',
    title: 'Uptown Funk (feat. Bruno Mars)',
    artist: 'Mark Ronson',
    album: 'Uptown Special',
    thumbnail: 'https://img.youtube.com/vi/OPf0YbXqDm0/hqdefault.jpg',
    duration: 270,
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
    mediaId: 'jfKfPfyJRdk',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    title: 'lofi hip hop radio - beats to relax/study to',
    artist: 'Lofi Girl',
    album: 'Live Chill Radio',
    thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    duration: 3600,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: '2Vv-BfVoq4g',
    url: 'https://www.youtube.com/watch?v=2Vv-BfVoq4g',
    title: 'Perfect',
    artist: 'Ed Sheeran',
    album: '÷ (Divide)',
    thumbnail: 'https://img.youtube.com/vi/2Vv-BfVoq4g/hqdefault.jpg',
    duration: 263,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: '09R8_2nJtjg',
    url: 'https://www.youtube.com/watch?v=09R8_2nJtjg',
    title: 'Sugar',
    artist: 'Maroon 5',
    album: 'V',
    thumbnail: 'https://img.youtube.com/vi/09R8_2nJtjg/hqdefault.jpg',
    duration: 301,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: 'hT_nvWreIhg',
    url: 'https://www.youtube.com/watch?v=hT_nvWreIhg',
    title: 'Counting Stars',
    artist: 'OneRepublic',
    album: 'Native',
    thumbnail: 'https://img.youtube.com/vi/hT_nvWreIhg/hqdefault.jpg',
    duration: 283,
    isPlayable: true,
  },
  {
    provider: 'youtube',
    sourceType: 'video',
    mediaId: 'YQHsXMglC9A',
    url: 'https://www.youtube.com/watch?v=YQHsXMglC9A',
    title: 'Hello',
    artist: 'Adele',
    album: '25',
    thumbnail: 'https://img.youtube.com/vi/YQHsXMglC9A/hqdefault.jpg',
    duration: 367,
    isPlayable: true,
  },
];

export async function searchSongs(query: string): Promise<MediaItemInput[]> {
  const clean = query.trim();
  if (!clean) return CURATED_TRACKS;

  const matchedCurated = CURATED_TRACKS.filter(
    (t) =>
      t.title.toLowerCase().includes(clean.toLowerCase()) ||
      t.artist.toLowerCase().includes(clean.toLowerCase())
  );

  // 1. Primary: Unified FreeToUse + YouTube search through backend API
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

  // 2. Return matched curated songs if backend search was unavailable
  if (matchedCurated.length > 0) {
    return matchedCurated;
  }

  return CURATED_TRACKS;
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
