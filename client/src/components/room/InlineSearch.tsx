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
import type { MediaItemInput } from '../../types.js';
import { formatTime } from '../../lib/format.js';

interface InlineSearchProps {
  notify: (title: string, description?: string, tone?: 'info' | 'success' | 'error') => void;
}

export function InlineSearch({ notify }: InlineSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItemInput[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    const clean = text.trim();
    if (!clean) {
      setResults(CURATED_TRACKS.slice(0, 5));
      setIsSearching(false);
      return;
    }

    setIsExpanded(true);
    setIsSearching(true);

    searchTimeout.current = setTimeout(async () => {
      // Check if user pasted a direct YouTube or Spotify link
      if (/youtu\.?be|youtube\.com|spotify\.com/i.test(clean)) {
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
        setResults(songs.slice(0, 8));
      } catch {
        setResults(CURATED_TRACKS.slice(0, 5));
      } finally {
        setIsSearching(false);
      }
    }, 250);
  };

  const handlePlayNow = (track: MediaItemInput) => {
    socket.emit('queue:play_now', { item: track });
    notify('Playing now', `${track.title} · ${track.artist}`, 'success');
    setIsExpanded(false);
    setQuery('');
  };

  const handleAddToQueue = (track: MediaItemInput) => {
    socket.emit('queue:add', { item: track });
    notify('Added to queue', `${track.title} · ${track.artist}`, 'success');
    setIsExpanded(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative w-full z-30">
      {/* Sleek Liquid Glass Search Input */}
      <div className="relative flex items-center">
        <Search className="absolute left-4 w-4 h-4 text-[#a8a29e] pointer-events-none" />
        <input
          type="text"
          value={query}
          onFocus={() => {
            setIsExpanded(true);
            if (results.length === 0) setResults(CURATED_TRACKS.slice(0, 5));
          }}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search full songs, artists, YouTube, or Audius tracks..."
          className="w-full pl-11 pr-24 py-3 rounded-2xl bg-white/[0.035] backdrop-blur-2xl border border-white/[0.09] text-white placeholder:text-[#a8a29e] text-xs sm:text-sm focus:outline-none focus:border-[#40E0D0]/60 focus:bg-white/[0.06] transition-all shadow-lg"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
              setIsExpanded(false);
            }}
            className="absolute right-3.5 p-1 text-[#a8a29e] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <div className="absolute right-3.5 hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-[#a8a29e] bg-white/[0.04] px-2 py-0.5 rounded-lg border border-white/5">
            <Sparkles className="w-3 h-3 text-[#40E0D0]" />
            <span>Full Songs</span>
          </div>
        )}
      </div>

      {/* Expandable Dropdown Results */}
      {isExpanded && (
        <div className="absolute top-full left-0 right-0 mt-2 p-3 rounded-2xl bg-[#1c1c1f]/95 border border-white/10 shadow-2xl space-y-2 max-h-[380px] overflow-y-auto backdrop-blur-3xl z-40">
          <div className="flex items-center justify-between px-2 text-xs text-[#a8a29e]">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              {query ? `Search Results (${results.length})` : 'Popular Tracks'}
            </span>
            {isSearching && (
              <span className="flex items-center gap-1 text-[#40E0D0] text-xs">
                <Loader2 className="w-3 h-3 animate-spin" />
                Searching...
              </span>
            )}
          </div>

          <div className="space-y-1">
            {results.map((track, idx) => (
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
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#212124] grid place-items-center text-[#fde5b7] shrink-0">
                      <Music2 className="w-4 h-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate group-hover:text-[#fde5b7] transition-colors">
                      {track.title}
                    </p>
                    <p className="text-[11px] text-[#a8a29e] truncate">
                      {track.artist}
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
                    title="Play now directly on all devices"
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

