import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Link2,
  Loader2,
  Music2,
  Plus,
  Radio,
  Sparkles,
  UploadCloud,
  Video,
} from 'lucide-react';
import { Modal } from './Modal.js';
import { cn } from '../lib/cn.js';
import { getApiUrl, socket } from '../services/socket.js';
import type { MediaItemInput, MediaProvider, ResolvedMedia } from '../types.js';
import { providerLabel } from '../lib/format.js';

interface AddMediaModalProps {
  open: boolean;
  onClose: () => void;
  notify: (title: string, description?: string, tone?: 'info' | 'success' | 'error') => void;
}

type Tab = 'link' | 'upload' | 'presets';

const AUDIO_RE = /\.(mp3|wav|ogg|oga|aac|m4a|flac|opus|webm)(\?.*)?$/i;

function detectProvider(value: string): MediaProvider | 'unknown' {
  const raw = value.trim();
  if (!raw) return 'unknown';
  if (/youtu\.?be|youtube\.com/i.test(raw)) return 'youtube';
  if (/spotify\.com|spotify:/i.test(raw)) return 'spotify';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (AUDIO_RE.test(url.pathname)) return 'audio';
  } catch {
    return 'unknown';
  }
  return 'unknown';
}

function providerIcon(provider: MediaProvider) {
  if (provider === 'youtube') return Video;
  if (provider === 'spotify') return Music2;
  return Radio;
}

export function AddMediaModal({ open, onClose, notify }: AddMediaModalProps) {
  const [tab, setTab] = useState<Tab>('link');
  const [url, setUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [preview, setPreview] = useState<ResolvedMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<MediaItemInput | null>(null);
  const [presets, setPresets] = useState<MediaItemInput[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const detected = detectProvider(url);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (tab !== 'presets' || presets) return;

    let cancelled = false;
    fetch(getApiUrl('/api/presets'))
      .then((response) => response.json())
      .then((data: { success?: boolean; presets?: MediaItemInput[] }) => {
        if (!cancelled && data.success && Array.isArray(data.presets)) {
          setPresets(data.presets);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the starter tracks.');
      });

    return () => {
      cancelled = true;
    };
  }, [open, tab, presets]);

  useEffect(() => {
    if (!open) {
      setUrl('');
      setPreview(null);
      setError(null);
      setUploaded(null);
    }
  }, [open]);

  const resolve = async () => {
    const clean = url.trim();
    if (!clean) {
      setError('Paste a link first.');
      return;
    }
    setResolving(true);
    setError(null);
    setPreview(null);

    try {
      const response = await fetch(getApiUrl('/api/resolve-media'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clean }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        data?: ResolvedMedia;
        error?: string;
      };
      if (!response.ok || !data.success || !data.data) {
        setError(data.error || 'That link could not be resolved.');
        return;
      }
      setPreview(data.data);
    } catch {
      setError('Could not reach the media resolver. Check your connection.');
    } finally {
      setResolving(false);
    }
  };

  const addItems = (items: MediaItemInput[], label: string) => {
    if (items.length === 0) return;
    socket.emit('queue:add', { items });
    notify(
      items.length > 1 ? `${items.length} tracks queued` : 'Added to queue',
      label,
      'success'
    );
    setPreview(null);
    setUploaded(null);
    setUrl('');
    onClose();
  };

  const uploadFile = async (file: File) => {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      setError('That file is larger than 30 MB.');
      return;
    }
    setUploading(true);
    setError(null);
    setUploaded(null);

    try {
      const body = new FormData();
      body.append('audio', file);
      const response = await fetch(getApiUrl('/api/upload'), { method: 'POST', body });
      const data = (await response.json()) as {
        success?: boolean;
        item?: MediaItemInput;
        error?: string;
      };
      if (!response.ok || !data.success || !data.item) {
        setError(data.error || 'Upload failed.');
        return;
      }
      setUploaded(data.item);
    } catch {
      setError('Upload failed. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add to the queue"
      description="YouTube videos, Shorts, playlists, Spotify links, direct audio, or an upload."
      className="max-w-xl"
    >
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/[0.06] bg-black/30 p-1">
        {(
          [
            { id: 'link', label: 'Link', icon: Link2 },
            { id: 'upload', label: 'Upload', icon: UploadCloud },
            { id: 'presets', label: 'Starter', icon: Sparkles },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setError(null);
            }}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
              tab === item.id
                ? 'bg-white/[0.08] text-white'
                : 'text-white/45 hover:text-white/75'
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'link' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="media-url" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  Media link
                </label>
                {detected !== 'unknown' && (
                  <span className="chip chip-accent py-1 text-[10px]">
                    {providerLabel(detected)} detected
                  </span>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  id="media-url"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setPreview(null);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void resolve();
                    }
                  }}
                  placeholder="https://youtube.com/watch?v=… or https://open.spotify.com/track/…"
                  className="field h-12 flex-1 text-[13px]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => void resolve()}
                  disabled={resolving || !url.trim()}
                  className="btn btn-ghost h-12 px-4"
                >
                  {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Fetch'}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
                {error}
              </div>
            )}

            {preview && <PreviewCard preview={preview} />}

            <button
              type="button"
              onClick={() => preview && addItems(preview.items, preview.title)}
              disabled={!preview}
              className="btn btn-primary h-11 w-full"
            >
              <Plus className="h-4 w-4" />
              {preview
                ? preview.items.length > 1
                  ? `Add ${preview.items.length} tracks`
                  : 'Add to queue'
                : 'Fetch a link to continue'}
            </button>
          </div>
        )}

        {tab === 'upload' && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void uploadFile(file);
              }}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-10 transition-colors',
                dragging
                  ? 'border-violet-400/60 bg-violet-500/10'
                  : 'border-white/12 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
              )}
            >
              {uploading ? (
                <Loader2 className="h-7 w-7 animate-spin text-violet-300" />
              ) : (
                <UploadCloud className="h-7 w-7 text-violet-300" />
              )}
              <div className="text-center">
                <p className="text-sm font-semibold text-white">
                  {uploading ? 'Uploading…' : 'Drop an audio file or click to browse'}
                </p>
                <p className="mt-1 text-[11px] text-white/35">MP3, WAV, OGG, M4A, FLAC · up to 30 MB</p>
              </div>
            </button>

            {error && (
              <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
                {error}
              </div>
            )}

            {uploaded && (
              <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-gradient-to-br from-violet-500/30 to-cyan-500/20">
                  <Music2 className="h-5 w-5 text-white/80" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{uploaded.title}</p>
                  <p className="text-[11px] text-white/40">Ready to queue</p>
                </div>
                <Check className="h-4 w-4 text-emerald-300" />
              </div>
            )}

            <button
              type="button"
              onClick={() => uploaded && addItems([uploaded], uploaded.title)}
              disabled={!uploaded}
              className="btn btn-primary h-11 w-full"
            >
              <Plus className="h-4 w-4" />
              Add uploaded file
            </button>

            <p className="text-center text-[10px] leading-relaxed text-white/25">
              Uploads live on the server instance. On serverless hosting they are temporary, so
              prefer links for permanent rooms.
            </p>
          </div>
        )}

        {tab === 'presets' && (
          <div className="space-y-3">
            {!presets && !error && (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-white/40">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading starters…
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
                {error}
              </div>
            )}
            {presets?.map((preset) => {
              const Icon = providerIcon(preset.provider);
              return (
                <button
                  key={preset.mediaId}
                  type="button"
                  onClick={() => addItems([preset], preset.title)}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <div className="relative h-14 w-14 flex-none overflow-hidden rounded-xl">
                    <img src={preset.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <Icon className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 text-white/90" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{preset.title}</p>
                    <p className="truncate text-[11px] text-white/40">{preset.artist}</p>
                  </div>
                  <Plus className="h-4 w-4 flex-none text-white/30 transition-colors group-hover:text-violet-300" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function PreviewCard({ preview }: { preview: ResolvedMedia }) {
  const Icon = providerIcon(preview.provider);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.03]">
      <div className="flex items-center gap-3 p-3">
        <div className="relative h-16 w-16 flex-none overflow-hidden rounded-xl">
          {preview.thumbnail ? (
            <img src={preview.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-gradient-to-br from-violet-500/30 to-cyan-500/20">
              <Icon className="h-6 w-6 text-white/70" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3 w-3 text-violet-300" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              {providerLabel(preview.provider)}
              {preview.sourceType ? ` · ${preview.sourceType}` : ''}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-white">
            {preview.title}
          </p>
          <p className="truncate text-[11px] text-white/40">{preview.artist}</p>
        </div>
        {preview.items.length > 1 && (
          <span className="chip flex-none py-1 text-[10px]">{preview.items.length} tracks</span>
        )}
      </div>
      {preview.warning && (
        <div className="border-t border-amber-300/15 bg-amber-400/[0.06] px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-200/80">
          {preview.warning}
        </div>
      )}
    </div>
  );
}
