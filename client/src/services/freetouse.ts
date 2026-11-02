import type { Track } from '../types.js';

interface FreeToUseV3Track {
  id: string;
  title: string;
  duration: number;
  record_label?: string;
  artists?: Array<[number, { id: string; name: string }]>;
  thumbnails?: {
    sm?: string;
    md?: string;
    lg?: string;
    xl?: string;
  };
  files?: {
    mp3?: string;
  };
}

export async function searchFreeToUseTracks(query = '', limit = 20): Promise<Track[]> {
  try {
    const q = query.trim();
    const endpoint = q
      ? `https://api.freetouse.com/v3/music/tracks/search?q=${encodeURIComponent(q)}&limit=${limit}`
      : `https://api.freetouse.com/v3/music/tracks/all?limit=${limit}&order=plays&sort=desc`;

    const res = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return getFallbackTracks(q);
    }

    const data = await res.json() as { data?: FreeToUseV3Track[] } | FreeToUseV3Track[];
    const list: FreeToUseV3Track[] = Array.isArray(data) ? data : data.data || [];

    const tracks: Track[] = list
      .filter((item) => Boolean(item.files?.mp3))
      .map((item) => {
        const artistName = item.artists?.[0]?.[1]?.name || item.record_label || 'Free To Use';
        return {
          id: `ftu_${item.id}`,
          title: item.title,
          artist: artistName,
          url: item.files!.mp3!,
          duration: Math.round(item.duration || 180),
          coverUrl: item.thumbnails?.md || item.thumbnails?.lg || item.thumbnails?.sm,
          source: 'freetouse' as const,
        };
      });

    if (tracks.length === 0) {
      return getFallbackTracks(q);
    }

    return tracks;
  } catch (err) {
    console.warn('[FreeToUse] Direct search fallback:', err);
    return getFallbackTracks(query);
  }
}

export function getFallbackTracks(query = ''): Track[] {
  const library: Track[] = [
    {
      id: 'ftu_lofi_cozy',
      title: 'Cozy Morning (Lo-Fi)',
      artist: 'Ghostrifter',
      url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
      duration: 147,
      coverUrl: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=400&q=80',
      source: 'freetouse',
    },
    {
      id: 'ftu_synth_night',
      title: 'Midnight Drive (Synthwave)',
      artist: 'Kavinsky Vibe',
      url: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=synthwave-80s-110045.mp3',
      duration: 172,
      coverUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&q=80',
      source: 'freetouse',
    },
    {
      id: 'ftu_chill_sunset',
      title: 'Golden Sunset (Chillhop)',
      artist: 'LAKEY INSPIRED',
      url: 'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3?filename=chill-abstract-intention-12099.mp3',
      duration: 184,
      coverUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80',
      source: 'freetouse',
    },
    {
      id: 'ftu_cyberpunk_beat',
      title: 'Neon Skyline (Electronic)',
      artist: 'Infraction',
      url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=electronic-future-beats-117997.mp3',
      duration: 156,
      coverUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80',
      source: 'freetouse',
    },
    {
      id: 'ftu_acoustic_dreams',
      title: 'Acoustic Breeze',
      artist: 'Acoustic Soul',
      url: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_bb630cc098.mp3?filename=acoustic-guitar-loop-f-91bpm-1367.mp3',
      duration: 125,
      coverUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&q=80',
      source: 'freetouse',
    },
  ];

  if (!query) return library;
  const q = query.toLowerCase();
  const matched = library.filter(
    (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );
  return matched.length > 0 ? matched : library;
}
