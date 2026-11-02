import React, { useState, useEffect } from 'react';
import type { Track } from '@vybe/shared';
import { Search, X, Music, Plus, Check, Link as LinkIcon, Upload, Sparkles } from 'lucide-react';
import { searchFreeToUseTracks } from '../services/freetouse.js';
import { formatSeconds } from '../lib/format.js';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTrack: (track: Track) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, onAddTrack }) => {
  const [activeTab, setActiveTab] = useState<'freetouse' | 'custom'>('freetouse');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Custom URL inputs
  const [customUrl, setCustomUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customArtist, setCustomArtist] = useState('');

  // Initial trending tracks load
  useEffect(() => {
    if (isOpen) {
      loadTracks('');
    }
  }, [isOpen]);

  const loadTracks = async (q: string) => {
    setLoading(true);
    const tracks = await searchFreeToUseTracks(q, 20);
    setResults(tracks);
    setLoading(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadTracks(searchQuery);
  };

  const handleAddTrack = (track: Track) => {
    onAddTrack(track);
    setAddedIds((prev) => new Set([...prev, track.id]));
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }, 1500);
  };

  const handleAddCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;

    const track: Track = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: customTitle.trim() || 'Custom Stream',
      artist: customArtist.trim() || 'Direct Audio',
      url: customUrl.trim(),
      duration: 180,
      coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80',
      source: 'url',
    };

    onAddTrack(track);
    setCustomUrl('');
    setCustomTitle('');
    setCustomArtist('');
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    const track: Track = {
      id: `upload_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Local File',
      url: localUrl,
      duration: 200,
      coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80',
      source: 'upload',
    };

    onAddTrack(track);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="glass-panel w-full max-w-2xl rounded-3xl p-6 sm:p-7 shadow-2xl relative flex flex-col max-h-[85vh] overflow-hidden border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-400" />
            <h2 className="text-lg font-bold text-white">Add Music to Room</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-4 mb-4">
          <button
            onClick={() => setActiveTab('freetouse')}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
              activeTab === 'freetouse'
                ? 'bg-brand-500/20 text-brand-200 border border-brand-500/40'
                : 'bg-white/5 text-zinc-400 border border-transparent hover:bg-white/10'
            }`}
          >
            FreeToUse Catalog
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
              activeTab === 'custom'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                : 'bg-white/5 text-zinc-400 border border-transparent hover:bg-white/10'
            }`}
          >
            Direct Link / File Upload
          </button>
        </div>

        {/* Tab 1: FreeToUse Search */}
        {activeTab === 'freetouse' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative mb-4">
              <input
                type="text"
                placeholder="Search Lo-Fi, Synthwave, Chillhop, Pop..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl bg-white/5 border border-white/10 pl-10 pr-20 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/50"
              />
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400" />
              <button
                type="submit"
                className="absolute right-2 top-2 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 transition-all"
              >
                Search
              </button>
            </form>

            {/* Category Tags */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {['Lo-Fi', 'Synthwave', 'Chillhop', 'Electronic', 'Acoustic'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setSearchQuery(cat);
                    void loadTracks(cat);
                  }}
                  className="rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-all"
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {loading ? (
                <div className="py-12 text-center text-xs text-zinc-500">
                  Loading music catalog...
                </div>
              ) : results.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500">
                  No matching tracks found. Try another query.
                </div>
              ) : (
                results.map((track) => {
                  const isAdded = addedIds.has(track.id);
                  return (
                    <div
                      key={track.id}
                      className="flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/[0.05] p-2.5 hover:bg-white/[0.06] transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-lg overflow-hidden shrink-0 bg-zinc-800 flex items-center justify-center">
                          {track.coverUrl ? (
                            <img src={track.coverUrl} alt={track.title} className="h-full w-full object-cover" />
                          ) : (
                            <Music className="h-5 w-5 text-zinc-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{track.title}</p>
                          <p className="text-[11px] text-zinc-400 truncate">{track.artist}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-[11px] text-zinc-500">
                          {formatSeconds(track.duration)}
                        </span>
                        <button
                          onClick={() => handleAddTrack(track)}
                          disabled={isAdded}
                          className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                            isAdded
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-brand-600 hover:bg-brand-500 text-white shadow-sm active:scale-95'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>Added</span>
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" />
                              <span>Queue</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Custom URL or File Upload */}
        {activeTab === 'custom' && (
          <div className="flex-1 overflow-y-auto space-y-6 pt-2">
            {/* Direct Link Form */}
            <form onSubmit={handleAddCustomUrl} className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5 text-cyan-400" />
                <span>Add via Direct Audio URL</span>
              </h3>
              <input
                type="url"
                required
                placeholder="https://example.com/audio.mp3"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Song Title (Optional)"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Artist (Optional)"
                  value={customArtist}
                  onChange={(e) => setCustomArtist(e.target.value)}
                  className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-brand-600 py-2.5 text-xs font-semibold text-white shadow-lg transition-all hover:opacity-95"
              >
                Add Audio Link
              </button>
            </form>

            {/* Local Audio File Upload */}
            <div className="pt-4 border-t border-white/5">
              <h3 className="text-xs font-bold text-zinc-300 mb-3 flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5 text-brand-400" />
                <span>Upload Local Audio File (.mp3, .wav, .m4a)</span>
              </h3>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 hover:border-brand-500/50 rounded-2xl p-6 cursor-pointer bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                <Music className="h-8 w-8 text-zinc-500 mb-2" />
                <span className="text-xs font-medium text-zinc-300">Choose an audio file</span>
                <span className="text-[10px] text-zinc-500 mt-1">Plays instantly in sample-sync across peers</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

