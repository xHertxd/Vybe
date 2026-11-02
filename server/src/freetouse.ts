import express, { type Request, type Response } from 'express';
import type { Track } from './types.js';

const router = express.Router();

interface FreeToUseTrackRaw {
  id?: string | number;
  title?: string;
  artist?: string;
  url?: string;
  audio_url?: string;
  duration?: number;
  cover?: string;
  thumbnail?: string;
  category?: string;
}

function normalizeFreeToUseTrack(raw: FreeToUseTrackRaw, index = 0): Track | null {
  const audioUrl = raw.audio_url || raw.url;
  if (!audioUrl || typeof audioUrl !== 'string') return null;

  return {
    id: `ftu_${raw.id || index}_${Math.random().toString(36).slice(2, 7)}`,
    title: raw.title || 'Untitled Track',
    artist: raw.artist || 'FreeToUse Artist',
    url: audioUrl,
    duration: typeof raw.duration === 'number' && raw.duration > 0 ? Math.round(raw.duration) : 180,
    coverUrl: raw.cover || raw.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80',
    source: 'freetouse',
  };
}

// ---------------------------------------------------------------------------
// 1. Search FreeToUse Tracks
// ---------------------------------------------------------------------------
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const apiUrl = query
      ? `https://freetouse.com/api/search?q=${encodeURIComponent(query)}&limit=${limit}`
      : `https://freetouse.com/api/trending?limit=${limit}`;

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Vybe-Sync-Audio/2.0',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      res.json({ success: true, tracks: getFallbackTracks(query) });
      return;
    }

    const data = await response.json() as { tracks?: FreeToUseTrackRaw[]; results?: FreeToUseTrackRaw[]; data?: FreeToUseTrackRaw[] };
    const rawList = Array.isArray(data)
      ? data
      : (data.tracks || data.results || data.data || []);

    const tracks: Track[] = (rawList as FreeToUseTrackRaw[])
      .map((item, i) => normalizeFreeToUseTrack(item, i))
      .filter((t): t is Track => t !== null)
      .slice(0, limit);

    if (tracks.length === 0) {
      res.json({ success: true, tracks: getFallbackTracks(query) });
      return;
    }

    res.json({ success: true, tracks });
  } catch (err) {
    res.json({ success: true, tracks: getFallbackTracks('') });
  }
});

// ---------------------------------------------------------------------------
// 2. Audio Proxy (Bypasses any CORS restrictions on direct audio URLs)
// ---------------------------------------------------------------------------
router.get('/proxy-audio', async (req: Request, res: Response) => {
  const targetUrl = typeof req.query.url === 'string' ? req.query.url : null;
  if (!targetUrl) {
    res.status(400).send('Missing url parameter');
    return;
  }

  try {
    const range = req.headers.range;
    const headers: Record<string, string> = {
      'User-Agent': 'Vybe-Audio-Sync/2.0',
    };
    if (range) headers['Range'] = range;

    const audioRes = await fetch(targetUrl, { headers });
    if (!audioRes.ok && audioRes.status !== 206) {
      res.status(audioRes.status).send('Upstream audio fetch failed');
      return;
    }

    // Set CORS headers so browser Web Audio API can decode the buffer
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Accept-Ranges', 'bytes');

    const contentType = audioRes.headers.get('content-type') || 'audio/mpeg';
    const contentLength = audioRes.headers.get('content-length');
    const contentRange = audioRes.headers.get('content-range');

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.status(audioRes.status);

    if (!audioRes.body) {
      res.end();
      return;
    }

    // Stream response
    const reader = audioRes.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          break;
        }
        res.write(value);
      }
    };
    await pump();
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).send('Audio stream error');
    }
  }
});

// Fallback high-quality direct MP3 tracks if upstream network or search is empty
function getFallbackTracks(query: string): Track[] {
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

export default router;

