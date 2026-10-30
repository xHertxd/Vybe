import { useEffect, useRef, useState } from 'react';
import {
  Search,
  Play,
  Plus,
  X,
  Loader2,
  Sparkles,
  Music2,
} from 'lucide-react';
import { socket } from '../../services/socket.js';
import {
  searchSongs,
  CURATED_TRACKS,
  resolveDirectMedia,
} from '../../services/musicLibrary.js';
import {
  fetchTrendingTracks,
  fetchCategories,
  fetchCategoryTracks,
  type FreeToUseCategory,
} from '../../services/freeToUse.js';
import type { MediaItemInput } from '../../types.js';
import { formatTime } from '../../lib/format.js';

interface InlineSearchProps {
  notify: (title: string, description?: string, tone?: 'info' | 'success' | 'error') => void;
}

const FEATURED_VIBES = [
  { label: '🔥 Trending', query: '' },
  { label: '✨ Chill', query: 'chill' },
  { label: '🎧 Electronic', query: 'electronic' },
  { label: '🌿 Ambient', query: 'ambient' },
  { label: '🎨 Aesthetic', query: 'aesthetic' },
  { label: '☕ Lofi', query: 'lofi' },
  { label: '🎬 Cinematic', query: 'cinematic' },
];

export function InlineSearch({ notify }: InlineSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItemInput[]>(CURATED_TRACKS.slice(0, 8));
  const [activeVibe, setActiveVibe] = useState('🔥 Trending');
  const [isSearching, setIsSearching] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [categories, setCategories] = useState<FreeToUseCategory[]>([]);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Load trending tracks and categories on mount
  useEffect(() => {
    let mounted = true;
    void fetchTrendingTracks(10).then((tracks) => {
      if (mounted && tracks.length > 0) {
        setResults(tracks);
      }
    });
    void fetchCategories().then((cats) => {
      if (mounted && cats.length > 0) {
        setCategories(cats);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (text: string) => {
    setQuery(text);
    setActiveVibe('');
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    const clean = text.trim();
    if (!clean) {
      setIsSearching(true);
      void fetchTrendingTracks(10).then((tracks) => {
        setResults(tracks.length > 0 ? tracks : CURATED_TRACKS.slice(0, 8));
        setIsSearching(false);
      });
      return;
    }

    setIsExpanded(true);
    setIsSearching(true);

    searchTimeout.current = setTimeout(async () => {
      // Check if user pasted a direct YouTube, Spotify, or FreeToUse link
      if (/youtu\.?be|youtube\.com|spotify\.com|freetouse\.com/i.test(clean)) {
        try {
          const direct = await resolveDirectMedia(clean);
          setResults([direct]);
          setIsSearching(false);
          return;
        } catch {
          // Fall through to regular search
        }
      }

      try {
        const songs = await searchSongs(clean);
        setResults(songs.slice(0, 15));
      } catch {
        setResults(CURATED_TRACKS.slice(0, 8));
      } finally {
        setIsSearching(false);
      }
    }, 250);
  };

  const handleSelectVibe = async (vibeLabel: string, vibeQuery: string) => {
    setActiveVibe(vibeLabel);
    setQuery('');
    setIsExpanded(true);
    setIsSearching(true);

    try {
      if (!vibeQuery) {
        const trending = await fetchTrendingTracks(12);
        setResults(trending.length > 0 ? trending : CURATED_TRACKS.slice(0, 8));
      } else {
        // Find matching category ID or perform search
        const matchedCat = categories.find((c) =>
          c.name.toLowerCase() === vibeQuery.toLowerCase()
        );
        if (matchedCat) {
          const catTracks = await fetchCategoryTracks(matchedCat.id, 12);
          setResults(catTracks.length > 0 ? catTracks : await searchSongs(vibeQuery));
        } else {
          const songs = await searchSongs(vibeQuery);
          setResults(songs.slice(0, 12));
        }
      }
    } catch {
      setResults(CURATED_TRACKS.slice(0, 8));
    } finally {
      setIsSearching(false);
    }
  };

  const handlePlayNow = (track: MediaItemInput) => {
    socket.emit('queue:play_now', { item: track });
    notify('Playing now', `${track.title} · ${track.artist}`, 'success');
    setIsExpanded(false);
  };

  const handleAddToQueue = (track: MediaItemInput) => {
    socket.emit('queue:add', { item: track });
    notify('Added to queue', `${track.title} · ${track.artist}`, 'success');
    setIsExpanded(false);
  };

  return (
    <div ref={containerRef} className="relative w-full z-30">
      {/* Sleek Liquid Glass Search Input */}
      <div className="relative flex items-center">
        <Search className="absolute left-4 w-4 h-4 text-[#a8a29e] pointer-events-none" />
        <input
          type="text"
          value={query}
          onFocus={() => setIsExpanded(true)}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search FreeToUse music library, artists, vibes, or links..."
          className="w-full pl-11 pr-28 py-3 rounded-2xl bg-white/[0.035] backdrop-blur-2xl border border-white/[0.09] text-white placeholder:text-[#a8a29e] text-xs sm:text-sm focus:outline-none focus:border-[#40E0D0]/60 focus:bg-white/[0.06] transition-all shadow-lg"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              handleSelectVibe('🔥 Trending', '');
            }}
            className="absolute right-3.5 p-1 text-[#a8a29e] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <div className="absolute right-3.5 hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-[#a8a29e] bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/5">
            <Sparkles className="w-3 h-3 text-[#40E0D0]" />
            <span>Free To Use</span>
          </div>
        )}
      </div>

      {/* Expandable Dropdown Results */}
      {isExpanded && (
        <div className="absolute top-full left-0 right-0 mt-2 p-3 rounded-2xl bg-[#1c1c1f]/95 border border-white/10 shadow-2xl space-y-3 max-h-[420px] overflow-y-auto backdrop-blur-3xl z-40">
          {/* Vibe / Genre Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            {FEATURED_VIBES.map((v) => (
              <button
                key={v.label}
                type="button"
                onClick={() => handleSelectVibe(v.label, v.query)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 border ${
                  activeVibe === v.label
                    ? 'bg-[#fde5b7] text-black border-[#fde5b7] shadow-sm font-semibold'
                    : 'bg-white/[0.03] text-[#a8a29e] border-white/5 hover:text-white hover:border-white/15'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-1 text-xs text-[#a8a29e]">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              {query
                ? `Results for "${query}" (${results.length})`
                : `${activeVibe || 'Popular'} Tracks (${results.length})`}
            </span>
            {isSearching && (
              <span className="flex items-center gap-1 text-[#40E0D0] text-xs">
                <Loader2 className="w-3 h-3 animate-spin" />
                Searching FreeToUse...
              </span>
            )}
          </div>

          <div className="space-y-1">
            {results.map((track, idx) => {
              const isDirectAudio = track.provider === 'audio';
              return (
                <div
                  key={track.mediaId || idx}
                  className="group flex items-center justify-between p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-white/15 transition-all gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {track.thumbnail ? (
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-10 h-10 rounded-lg object-cover bg-black shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#212124] grid place-items-center text-[#fde5b7] shrink-0">
                        <Music2 className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-white truncate group-hover:text-[#fde5b7] transition-colors">
                          {track.title}
                        </p>
                        {isDirectAudio && (
                          <span className="hidden sm:inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#40E0D0]/10 text-[#40E0D0] border border-[#40E0D0]/20 shrink-0">
                            Audio
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#a8a29e] truncate">
                        {track.artist}
                        {track.album && ` · ${track.album}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-[#78716c] font-mono mr-1 hidden sm:inline">
                      {formatTime(track.duration)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePlayNow(track)}
                      className="px-2.5 py-1 rounded-lg bg-[#fde5b7] hover:bg-[#fee8c8] text-black font-semibold text-xs flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                      title="Play now directly across all devices"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Play</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddToQueue(track)}
                      className="p-1 rounded-lg bg-[#212124] hover:bg-[#2b2b30] text-[#fde5b7] border border-white/10 active:scale-95 transition-all"
                      title="Add to queue"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


