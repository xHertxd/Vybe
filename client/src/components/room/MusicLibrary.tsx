import { useEffect, useRef, useState } from 'react';
import {
  Search, Play, Plus, X, Loader2, Music2, ChevronLeft,
  Sparkles, Zap, Heart, Radio, ListMusic, Filter
} from 'lucide-react';
import { socket } from '../../services/socket.js';
import {
  fetchTrendingTracks,
  fetchCategoryTracks,
} from '../../services/freeToUse.js';
import { searchSongs, resolveDirectMedia } from '../../services/musicLibrary.js';
import type { MediaItemInput } from '../../types.js';
import { formatTime } from '../../lib/format.js';
import { cn } from '../../lib/cn.js';

interface MusicLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  notify: (title: string, description?: string, tone?: 'info' | 'success' | 'error') => void;
}

const VIBE_CATEGORIES = [
  { id: 'trending', label: 'Trending', icon: Zap },
  { id: 'chill', label: 'Chill', icon: Radio },
  { id: 'electronic', label: 'Electronic', icon: Sparkles },
  { id: 'ambient', label: 'Ambient', icon: Heart },
  { id: 'lofi', label: 'Lofi', icon: ListMusic },
  { id: 'cinematic', label: 'Cinematic', icon: Filter },
];

export function MusicLibrary({ isOpen, onClose, notify }: MusicLibraryProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItemInput[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('trending');
  const [isLoading, setIsLoading] = useState(true);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial data
  useEffect(() => {
    if (!isOpen) return;
    
    let mounted = true;
    setIsLoading(true);

    const loadInitial = async () => {
      try {
        const trending = await fetchTrendingTracks(30);
        if (!mounted) return;
        
        setResults(trending);
        setActiveCategory('trending');
      } catch (err) {
        console.warn('Failed to load music library:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadInitial();
    return () => { mounted = false; };
  }, [isOpen]);

  // Handle search with debounce
  const handleSearchChange = (text: string) => {
    setQuery(text);
    setActiveCategory('');
    
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    
    const clean = text.trim();
    if (!clean) {
      fetchTrendingTracks(30).then(tracks => {
        setResults(tracks.length > 0 ? tracks : []);
      });
      return;
    }

    // If user pasted a direct link, resolve it immediately
    if (/youtu\.?be|youtube\.com|spotify\.com|freetouse\.com/i.test(clean)) {
      resolveDirectMedia(clean).then(track => {
        setResults([track]);
      }).catch(() => {
        // Fall through to regular search
        doSearch(clean);
      });
      return;
    }

    doSearch(clean);
  };

  const doSearch = async (clean: string) => {
    try {
      // Use backend search which combines FreeToUse + YouTube
      const songs = await searchSongs(clean);
      setResults(songs);
    } catch {
      setResults([]);
    }
  };

  // Handle category selection
  const handleCategorySelect = async (categoryId: string) => {
    setActiveCategory(categoryId);
    setQuery('');

    try {
      if (categoryId === 'trending') {
        const trending = await fetchTrendingTracks(30);
        setResults(trending.length > 0 ? trending : []);
      } else {
        const catTracks = await fetchCategoryTracks(categoryId, 30);
        setResults(catTracks.length > 0 ? catTracks : []);
      }
    } catch {
      setResults([]);
    }
  };

  const handlePlayNow = (track: MediaItemInput) => {
    socket.emit('queue:play_now', { item: track });
    notify('Playing now', `${track.title} · ${track.artist}`, 'success');
    onClose();
  };

  const handleAddToQueue = (track: MediaItemInput) => {
    socket.emit('queue:add', { item: track });
    notify('Added to queue', `${track.title} · ${track.artist}`, 'success');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex flex-col bg-[#0d0d0d]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="music-library-title"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#0d0d0d]/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="icon-btn p-0 text-[#888] hover:text-white"
            aria-label="Close music library"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 id="music-library-title" className="font-display text-lg font-semibold text-white">Music Library</h1>
        </div>
        
        <div className="flex-1 max-w-md mx-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555]" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search tracks, artists, genres..."
              className="w-full pl-10 pr-10 py-2 rounded-full bg-[#1a1a1a] border border-white/5 text-white placeholder:text-[#555] text-sm focus:outline-none focus:border-[#e8d5b7]/50 focus:bg-[#1a1a1a] transition-all"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#555] hover:text-white"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#555] font-mono">{results.length} tracks</span>
        </div>
      </header>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#141414]/80 backdrop-blur sticky top-[52px] z-10 overflow-x-auto scrollbar-hide">
        {VIBE_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategorySelect(cat.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-all whitespace-nowrap',
                isActive
                  ? 'bg-[#e8d5b7] text-[#0d0d0d] shadow-sm'
                  : 'bg-[#1a1a1a] text-[#888] hover:text-white hover:bg-[#252525] border border-white/5'
              )}
              aria-selected={isActive}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Results */}
      <main className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-[#e8d5b7] animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-8">
            <Music2 className="w-12 h-12 text-[#333] mb-3" />
            <p className="text-[#555]">No tracks found</p>
            <p className="text-xs text-[#333] mt-1">Try a different search or category</p>
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((track, idx) => (
              <TrackRow
                key={track.mediaId || idx}
                track={track}
                index={idx + 1}
                onPlayNow={handlePlayNow}
                onAddToQueue={handleAddToQueue}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

interface TrackRowProps {
  track: MediaItemInput;
  index: number;
  onPlayNow: (track: MediaItemInput) => void;
  onAddToQueue: (track: MediaItemInput) => void;
}

function TrackRow({ track, index, onPlayNow, onAddToQueue }: TrackRowProps) {
  const isAudio = track.provider === 'audio';
  const isYouTube = track.provider === 'youtube';
  const isSpotify = track.provider === 'spotify';

  return (
    <button
      type="button"
      onClick={() => onPlayNow(track)}
      className={cn(
        'group flex items-center gap-3 p-2 rounded-lg transition-all',
        'hover:bg-white/[0.03] border border-transparent hover:border-white/5'
      )}
      aria-label={`Play ${track.title} by ${track.artist}`}
    >
      <span className="w-8 text-center text-xs text-[#555] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
        {index}
      </span>

      {track.thumbnail ? (
        <img
          src={track.thumbnail}
          alt=""
          className="w-12 h-12 rounded object-cover bg-[#1a1a1a] shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-[#1a1a1a] grid place-items-center text-[#e8d5b7] shrink-0">
          <Music2 className="w-5 h-5" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate group-hover:text-[#e8d5b7] transition-colors">
          {track.title}
        </p>
        <p className="text-xs text-[#888] truncate flex items-center gap-1.5">
          {track.artist}
          {track.album && <span>· {track.album}</span>}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-[#555] font-mono w-10 text-right">
          {track.duration > 0 ? formatTime(track.duration) : '--:--'}
        </span>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPlayNow(track); }}
          className="icon-btn p-1.5 bg-[#e8d5b7] text-[#0d0d0d] hover:bg-[#f0e0c8] hover:scale-105"
          aria-label={`Play ${track.title} now`}
        >
          <Play className="w-4 h-4 fill-current" />
        </button>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddToQueue(track); }}
          className="icon-btn p-1.5 bg-[#1a1a1a] text-[#e8d5b7] border border-white/5 hover:bg-[#252525]"
          aria-label={`Add ${track.title} to queue`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {isAudio && (
          <span className="chip-active text-[9px] px-1.5 py-0.5">
            Audio
          </span>
        )}
        {isYouTube && (
          <span className="chip text-[9px] px-1.5 py-0.5">
            <Radio className="w-2.5 h-2.5" />
          </span>
        )}
        {isSpotify && (
          <span className="chip text-[9px] px-1.5 py-0.5">
            <Heart className="w-2.5 h-2.5" />
          </span>
        )}
      </div>
    </button>
  );
}