import { useEffect, useRef, useState } from 'react';
import {
  Search,
  Play,
  Plus,
  Link2,
  UploadCloud,
  Music2,
  Video,
  X,
  Loader2,
} from 'lucide-react';
import { Modal } from './Modal.js';
import { cn } from '../lib/cn.js';
import { socket, getApiUrl } from '../services/socket.js';
import {
  searchSongs,
  CURATED_TRACKS,
  resolveDirectMedia,
} from '../services/musicLibrary.js';
import { fetchTrendingTracks } from '../services/freeToUse.js';
import type { MediaItemInput } from '../types.js';
import { formatDuration } from '../lib/format.js';

interface AddMediaModalProps {
  open: boolean;
  onClose: () => void;
  notify: (title: string, description?: string, tone?: 'info' | 'success' | 'error') => void;
}

type ModalTab = 'library' | 'link' | 'upload';

const POPULAR_QUERIES = [
  'Chill',
  'Electronic',
  'Lofi',
  'Ambient',
  'Aesthetic',
  'EDM',
  'Piano',
  'Summer',
  'Rock',
];

export function AddMediaModal({ open, onClose, notify }: AddMediaModalProps) {
  const [tab, setTab] = useState<ModalTab>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MediaItemInput[]>(CURATED_TRACKS);
  const [isSearching, setIsSearching] = useState(false);

  // Link tab states
  const [linkInput, setLinkInput] = useState('');
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const [linkPreview, setLinkPreview] = useState<MediaItemInput | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Upload tab states
  const [uploadedTrack, setUploadedTrack] = useState<MediaItemInput | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      void fetchTrendingTracks(20).then((tracks) => {
        if (tracks.length > 0 && !searchQuery) {
          setSearchResults(tracks);
        }
      });
    } else {
      setSearchQuery('');
      setSearchResults(CURATED_TRACKS);
      setLinkInput('');
      setLinkPreview(null);
      setLinkError(null);
      setUploadedTrack(null);
    }
  }, [open]);

  // Live search as user types
  const handleQueryChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (!text.trim()) {
      setSearchResults(CURATED_TRACKS);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchSongs(text);
        setSearchResults(results.length > 0 ? results : CURATED_TRACKS);
      } catch {
        setSearchResults(CURATED_TRACKS);
      } finally {
        setIsSearching(false);
      }
    }, 280);
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

  // Resolve direct URL
  const handleResolveLink = async () => {
    const clean = linkInput.trim();
    if (!clean) return;

    setIsResolvingLink(true);
    setLinkError(null);
    setLinkPreview(null);

    try {
      const item = await resolveDirectMedia(clean);
      setLinkPreview(item);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not resolve that link.');
    } finally {
      setIsResolvingLink(false);
    }
  };

  // Upload audio
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (file: File) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      notify('File too large', 'Please select an audio file under 50 MB.', 'error');
      return;
    }

    setIsUploading(true);
    const cleanTitle = file.name.replace(/\.[a-z0-9]+$/i, '');

    try {
      const formData = new FormData();
      formData.append('audio', file);
      const res = await fetch(getApiUrl('/api/upload'), {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const json = (await res.json()) as { success?: boolean; item?: MediaItemInput; fileUrl?: string };
        if (json.success && json.item) {
          setUploadedTrack(json.item);
          notify('Audio uploaded', `"${json.item.title}" is ready to stream to all devices.`, 'success');
          return;
        }
      }
    } catch {
      // Fallback to local preview
    } finally {
      setIsUploading(false);
    }

    const objectUrl = URL.createObjectURL(file);
    const item: MediaItemInput = {
      provider: 'audio',
      sourceType: 'upload',
      mediaId: `upload_${Date.now()}`,
      url: objectUrl,
      title: cleanTitle,
      artist: 'Local Audio',
      thumbnail: '',
      duration: 180,
      isPlayable: true,
    };

    setUploadedTrack(item);
  };

  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl w-full p-0 overflow-hidden bg-[#141416] rounded-[32px] border border-white/[0.12] shadow-[0_25px_60px_rgba(0,0,0,0.8)]" hideClose>
      <div className="flex flex-col h-[600px] max-h-[85vh] bg-[#141416] text-[#F5F5DC]">
        {/* Modal Header & Navigation */}
        <div className="p-5 pb-3 border-b border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#fde5b7] text-black grid place-items-center font-bold">
                <Music2 className="w-4 h-4 text-black" />
              </div>
              <div>
                <h2 className="font-brand font-black text-lg text-white tracking-tight">
                  Music Library
                </h2>
                <p className="text-[11px] text-[#a8a29e]">
                  Search songs, drop YouTube or Spotify links, or upload audio.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#a8a29e] hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 bg-[#171719] p-1 rounded-xl border border-white/5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setTab('library')}
              className={cn(
                'flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all',
                tab === 'library' ? 'bg-[#fde5b7] text-black shadow-sm font-bold' : 'text-[#a8a29e] hover:text-white'
              )}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Browse Library</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('link')}
              className={cn(
                'flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all',
                tab === 'link' ? 'bg-[#fde5b7] text-black shadow-sm font-bold' : 'text-[#a8a29e] hover:text-white'
              )}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Paste Link</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('upload')}
              className={cn(
                'flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all',
                tab === 'upload' ? 'bg-[#fde5b7] text-black shadow-sm font-bold' : 'text-[#a8a29e] hover:text-white'
              )}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Upload Audio</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: BROWSE & SEARCH LIBRARY */}
          {tab === 'library' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a8a29e]" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder="Search FreeToUse music library, artists, vibes, or paste links..."
                  className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder:text-[#a8a29e] text-sm focus:outline-none focus:border-[#40E0D0]/60 focus:bg-white/[0.06] transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => handleQueryChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#a8a29e] hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Quick Search Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-[10px] uppercase font-bold text-[#78716c] tracking-wider shrink-0 mr-1">
                  Popular:
                </span>
                {POPULAR_QUERIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleQueryChange(q)}
                    className="px-2.5 py-1 rounded-full bg-[#171719] border border-white/5 text-[#a8a29e] hover:text-[#fde5b7] hover:border-[#fde5b7]/30 transition-all shrink-0 text-xs"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Track Results */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[#a8a29e] px-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">
                    {searchQuery ? `Search Results (${searchResults.length})` : 'Featured Tracks'}
                  </span>
                  {isSearching && (
                    <span className="flex items-center gap-1.5 text-xs text-[#fde5b7]">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Searching...
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {searchResults.map((track, idx) => (
                    <div
                      key={track.mediaId || idx}
                      className="group flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.12] transition-all gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {track.thumbnail ? (
                          <img
                            src={track.thumbnail}
                            alt={track.title}
                            className="w-12 h-12 rounded-lg object-cover bg-black shrink-0 shadow-sm"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-[#262629] grid place-items-center text-[#fde5b7] shrink-0">
                            <Music2 className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-white truncate group-hover:text-[#fde5b7] transition-colors">
                              {track.title}
                            </p>
                            {track.provider === 'audio' && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#40E0D0]/10 text-[#40E0D0] border border-[#40E0D0]/20 shrink-0">
                                Audio
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#a8a29e] truncate">
                            {track.artist}
                            {track.album && ` · ${track.album}`}
                          </p>
                          <span className="text-[10px] text-[#78716c] font-mono">
                            {formatDuration(track.duration)}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons: Play Directly & Add to Queue */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePlayNow(track)}
                          className="px-3 py-1.5 rounded-lg bg-[#fde5b7] hover:bg-[#fee8c8] text-black font-semibold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                          title="Play directly on all devices"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Play Now</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddToQueue(track)}
                          className="p-1.5 rounded-lg bg-[#262629] hover:bg-[#313136] text-[#fde5b7] border border-white/10 hover:border-white/20 active:scale-95 transition-all"
                          title="Add to queue"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PASTE LINK */}
          {tab === 'link' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-semibold text-[#a8a29e] mb-1.5">
                  Paste YouTube, Spotify, or Audio URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={linkInput}
                    onChange={(e) => {
                      setLinkInput(e.target.value);
                      setLinkError(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleResolveLink()}
                    placeholder="https://www.youtube.com/watch?v=... or Spotify link"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#171719] border border-white/10 text-white placeholder:text-[#78716c] text-sm focus:outline-none focus:border-[#fde5b7]/50"
                  />
                  <button
                    type="button"
                    onClick={handleResolveLink}
                    disabled={isResolvingLink || !linkInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-[#fde5b7] text-black font-semibold text-xs hover:bg-[#fee8c8] disabled:opacity-50 transition-all flex items-center gap-1.5"
                  >
                    {isResolvingLink ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>Resolve</span>
                    )}
                  </button>
                </div>
              </div>

              {linkError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs">
                  {linkError}
                </div>
              )}

              {linkPreview && (
                <div className="p-4 rounded-2xl bg-[#171719] border border-white/10 space-y-4">
                  <div className="flex items-center gap-3">
                    {linkPreview.thumbnail ? (
                      <img
                        src={linkPreview.thumbnail}
                        alt={linkPreview.title}
                        className="w-16 h-16 rounded-xl object-cover bg-black shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-[#262629] grid place-items-center text-[#fde5b7] shrink-0">
                        {linkPreview.provider === 'youtube' ? (
                          <Video className="w-6 h-6" />
                        ) : (
                          <Music2 className="w-6 h-6" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold text-[#fde5b7] tracking-wider">
                        {linkPreview.provider} · {linkPreview.sourceType}
                      </span>
                      <p className="text-sm font-bold text-white truncate">
                        {linkPreview.title}
                      </p>
                      <p className="text-xs text-[#a8a29e] truncate">{linkPreview.artist}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => handlePlayNow(linkPreview)}
                      className="flex-1 py-2 rounded-xl bg-[#fde5b7] text-black font-semibold text-xs hover:bg-[#fee8c8] flex items-center justify-center gap-1.5 transition-all shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Play Now</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddToQueue(linkPreview)}
                      className="flex-1 py-2 rounded-xl bg-[#262629] text-[#fde5b7] font-semibold text-xs hover:bg-[#313136] border border-white/10 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Queue</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: UPLOAD AUDIO */}
          {tab === 'upload' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                }}
                className="hidden"
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'p-8 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all',
                  isDragging
                    ? 'border-[#fde5b7] bg-[#fde5b7]/5'
                    : 'border-white/10 hover:border-white/20 bg-[#171719]'
                )}
              >
                <div className="w-12 h-12 rounded-2xl bg-[#262629] grid place-items-center text-[#fde5b7] mb-3">
                  <UploadCloud className="w-6 h-6" />
                </div>
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-[#40E0D0] animate-spin" />
                    <p className="text-sm font-semibold text-[#fde5b7]">Uploading to room for all devices...</p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-white">Click or drag audio file here</p>
                    <p className="text-xs text-[#a8a29e] mt-1">Supports MP3, WAV, AAC, M4A up to 50MB</p>
                  </>
                )}
              </div>

              {uploadedTrack && (
                <div className="p-4 rounded-2xl bg-[#171719] border border-white/10 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#262629] grid place-items-center text-[#fde5b7] shrink-0">
                      <Music2 className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">
                        {uploadedTrack.title}
                      </p>
                      <p className="text-xs text-[#a8a29e]">Audio file ready</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => handlePlayNow(uploadedTrack)}
                      className="flex-1 py-2 rounded-xl bg-[#fde5b7] text-black font-semibold text-xs hover:bg-[#fee8c8] flex items-center justify-center gap-1.5 transition-all shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Play Now</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddToQueue(uploadedTrack)}
                      className="flex-1 py-2 rounded-xl bg-[#262629] text-[#fde5b7] font-semibold text-xs hover:bg-[#313136] border border-white/10 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Queue</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
