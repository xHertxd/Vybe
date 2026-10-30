import React, { useState } from 'react';
import type { UnifiedMediaItem, MediaProvider } from '../../types.js';
import { socket, getApiUrl } from '../../services/socket.js';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Play,
  Upload,
  Link,
  Sparkles,
  Music2,
  Radio,
  Clock,
  Check,
  AlertCircle,
  Loader2,
  Video
} from 'lucide-react';

interface UnifiedQueueProps {
  queue: UnifiedMediaItem[];
  currentIndex: number;
  roomCode: string;
  isAdmin: boolean;
  username: string;
}

export const UnifiedQueue: React.FC<UnifiedQueueProps> = ({
  queue,
  currentIndex,
  roomCode,
  isAdmin
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'link' | 'upload' | 'presets'>('link');
  const [urlInput, setUrlInput] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedPreview, setResolvedPreview] = useState<any | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Intelligent Link Detection and Preview Fetch
  const handleResolveUrl = async () => {
    if (!urlInput.trim()) return;

    setIsResolving(true);
    setResolveError(null);
    setResolvedPreview(null);

    try {
      const response = await fetch(getApiUrl('/api/resolve-media'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to detect or resolve media URL.');
      }

      setResolvedPreview(data.data);
    } catch (err: any) {
      setResolveError(err.message || 'Error resolving media link.');
    } finally {
      setIsResolving(false);
    }
  };

  const handleAddResolvedItem = () => {
    if (!resolvedPreview || !isAdmin) return;

    socket.emit('queue:add', {
      roomCode,
      item: resolvedPreview
    });

    setUrlInput('');
    setResolvedPreview(null);
    setShowAddModal(false);
  };

  // Add a preset track
  const handleAddPreset = async (presetUrl: string) => {
    if (!isAdmin) return;
    try {
      const response = await fetch(getApiUrl('/api/resolve-media'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: presetUrl })
      });
      const data = await response.json();
      if (data.success) {
        socket.emit('queue:add', {
          roomCode,
          item: data.data
        });
        setShowAddModal(false);
      }
    } catch (e) {
      console.error('Failed to add preset:', e);
    }
  };

  // File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;

    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('audio', file);

    try {
      const response = await fetch(getApiUrl('/api/upload'), {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'File upload failed');
      }

      socket.emit('queue:add', {
        roomCode,
        item: data.item
      });

      setShowAddModal(false);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload audio file');
    } finally {
      setUploading(false);
    }
  };

  // Admin Queue Actions
  const handleRemoveItem = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin) return;
    socket.emit('queue:remove', { roomCode, itemId });
  };

  const handleMoveUp = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin || index <= 0) return;
    socket.emit('queue:reorder', { roomCode, startIndex: index, endIndex: index - 1 });
  };

  const handleMoveDown = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin || index >= queue.length - 1) return;
    socket.emit('queue:reorder', { roomCode, startIndex: index, endIndex: index + 1 });
  };

  const handlePlayIndex = (index: number) => {
    if (!isAdmin) return;
    socket.emit('queue:play_index', { roomCode, index });
  };

  const handleClearQueue = () => {
    if (!isAdmin) return;
    if (confirm('Clear upcoming tracks from the queue?')) {
      socket.emit('queue:clear', { roomCode });
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const renderProviderIcon = (provider: MediaProvider) => {
    switch (provider) {
      case 'youtube':
        return (
          <svg className="w-3.5 h-3.5 fill-red-500" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        );
      case 'spotify':
        return <Radio className="w-3.5 h-3.5 text-[#1db954]" />;
      default:
        return <Music2 className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Queue Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
            <span>Room Queue</span>
            <span className="text-xs font-normal text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
              {queue.length} {queue.length === 1 ? 'track' : 'tracks'}
            </span>
          </h3>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            {queue.length > 1 && (
              <button
                onClick={handleClearQueue}
                className="text-xs text-slate-400 hover:text-red-400 px-2 py-1 rounded transition-colors"
                title="Clear upcoming tracks"
              >
                Clear
              </button>
            )}

            <button
              onClick={() => {
                setShowAddModal(true);
                setResolvedPreview(null);
                setResolveError(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md hover:shadow-purple-500/25 transition-all hover:scale-102 active:scale-98"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Media</span>
            </button>
          </div>
        )}
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto py-3 space-y-2 pr-1">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-center">
            <Music2 className="w-10 h-10 stroke-[1.5] mb-2 text-slate-600" />
            <p className="text-xs">Queue is empty</p>
            {isAdmin && (
              <p className="text-[11px] text-slate-400 mt-1">
                Click &quot;Add Media&quot; to queue YouTube, Spotify, or audio tracks
              </p>
            )}
          </div>
        ) : (
          queue.map((item, idx) => {
            const isCurrent = idx === currentIndex;
            return (
              <div
                key={item.id}
                onClick={() => isAdmin && handlePlayIndex(idx)}
                className={`group flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                  isCurrent
                    ? 'bg-purple-950/40 border-purple-500/50 shadow-lg shadow-purple-950/30'
                    : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/5'
                } ${isAdmin ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Track Index or Playing Wave Indicator */}
                  <div className="w-5 text-center shrink-0">
                    {isCurrent ? (
                      <div className="flex items-end justify-center gap-0.5 h-4">
                        <span className="w-0.5 bg-purple-400 rounded-full animate-bounce h-3" />
                        <span className="w-0.5 bg-purple-400 rounded-full animate-bounce h-4" style={{ animationDelay: '0.15s' }} />
                        <span className="w-0.5 bg-purple-400 rounded-full animate-bounce h-2" style={{ animationDelay: '0.3s' }} />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 font-mono group-hover:hidden">{idx + 1}</span>
                    )}
                    {isAdmin && !isCurrent && (
                      <Play className="w-3.5 h-3.5 text-purple-400 hidden group-hover:block mx-auto" />
                    )}
                  </div>

                  {/* Thumbnail */}
                  <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-black/40 shrink-0 border border-white/10">
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&fit=crop';
                      }}
                    />
                    <div className="absolute bottom-0 right-0 p-0.5 bg-black/80 rounded-tl">
                      {renderProviderIcon(item.provider)}
                    </div>
                  </div>

                  {/* Track Details */}
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold truncate ${isCurrent ? 'text-purple-300' : 'text-slate-200'}`}>
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 truncate mt-0.5">
                      <span className="truncate">{item.artist}</span>
                      <span>•</span>
                      <span className="text-slate-500 text-[10px] shrink-0">{item.addedBy}</span>
                    </div>
                  </div>
                </div>

                {/* Right controls: duration & admin reorder/delete */}
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mr-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {formatTime(item.duration)}
                  </span>

                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleMoveUp(idx, e)}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-white/10"
                        title="Move Up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleMoveDown(idx, e)}
                        disabled={idx === queue.length - 1}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-white/10"
                        title="Move Down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleRemoveItem(item.id, e)}
                        className="p-1 text-slate-400 hover:text-red-400 rounded hover:bg-red-500/10"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Media Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#12141e] border border-white/15 rounded-2xl p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Add Media to Queue
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10"
              >
                Close
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/10 mt-4">
              <button
                onClick={() => setActiveTab('link')}
                className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  activeTab === 'link'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Link className="w-3.5 h-3.5" />
                Intelligent Link
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  activeTab === 'upload'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Audio File
              </button>
              <button
                onClick={() => setActiveTab('presets')}
                className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  activeTab === 'presets'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                Demo Presets
              </button>
            </div>

            {/* Tab 1: Intelligent Link Detection */}
            {activeTab === 'link' && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs text-slate-300 block mb-1.5 font-medium">
                    Paste YouTube, Spotify, or Direct Audio URL:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleResolveUrl()}
                      placeholder="e.g. https://www.youtube.com/watch?v=... or https://open.spotify.com/track/..."
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      onClick={handleResolveUrl}
                      disabled={isResolving || !urlInput.trim()}
                      className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-md"
                    >
                      {isResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Detect
                    </button>
                  </div>
                </div>

                {resolveError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{resolveError}</span>
                  </div>
                )}

                {/* Resolved Preview Card */}
                {resolvedPreview && (
                  <div className="p-4 rounded-xl bg-white/[0.04] border border-purple-500/30 flex items-center gap-3">
                    <img
                      src={resolvedPreview.thumbnail}
                      alt={resolvedPreview.title}
                      className="w-14 h-14 rounded-lg object-cover bg-black/50 border border-white/10 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {renderProviderIcon(resolvedPreview.provider)}
                        <span className="text-[10px] uppercase font-bold text-slate-400">
                          {resolvedPreview.provider}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white truncate mt-0.5">{resolvedPreview.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{resolvedPreview.artist}</p>
                    </div>

                    <button
                      onClick={handleAddResolvedItem}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow transition-all hover:scale-105 shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Add to Queue
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: File Upload */}
            {activeTab === 'upload' && (
              <div className="mt-4 space-y-3">
                <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/15 hover:border-purple-500/60 rounded-2xl cursor-pointer bg-black/20 hover:bg-purple-950/10 transition-colors">
                  <Upload className="w-8 h-8 text-purple-400 mb-2" />
                  <span className="text-xs font-semibold text-slate-200">
                    {uploading ? 'Uploading audio...' : 'Choose an audio file to upload'}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1">Supports MP3, WAV, OGG, FLAC, M4A (Max 30MB)</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>

                {uploadError && (
                  <p className="text-xs text-red-400 text-center">{uploadError}</p>
                )}
              </div>
            )}

            {/* Tab 3: Presets */}
            {activeTab === 'presets' && (
              <div className="mt-4 space-y-2 max-h-60 overflow-y-auto pr-1">
                <div
                  onClick={() => handleAddPreset('https://www.youtube.com/watch?v=jfKfPfyJRdk')}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Video className="w-4 h-4 text-red-500" />
                    <div>
                      <p className="text-xs font-semibold text-white">Lofi Girl Live Radio</p>
                      <p className="text-[10px] text-slate-400">YouTube Stream</p>
                    </div>
                  </div>
                  <span className="text-xs text-purple-400 font-semibold">+ Add</span>
                </div>

                <div
                  onClick={() => handleAddPreset('https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3')}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Music2 className="w-4 h-4 text-purple-400" />
                    <div>
                      <p className="text-xs font-semibold text-white">Midnight Chill (Lo-Fi)</p>
                      <p className="text-[10px] text-slate-400">Direct Audio Stream</p>
                    </div>
                  </div>
                  <span className="text-xs text-purple-400 font-semibold">+ Add</span>
                </div>

                <div
                  onClick={() => handleAddPreset('https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=neon-gaming-108740.mp3')}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Radio className="w-4 h-4 text-cyan-400" />
                    <div>
                      <p className="text-xs font-semibold text-white">Neon Horizon (Synthwave)</p>
                      <p className="text-[10px] text-slate-400">Direct Audio Stream</p>
                    </div>
                  </div>
                  <span className="text-xs text-purple-400 font-semibold">+ Add</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
