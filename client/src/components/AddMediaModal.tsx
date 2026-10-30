import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Link2,
  Loader2,
  Music2,
  Plus,
  Radio,
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

type Tab = 'link' | 'upload';

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
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const detected = detectProvider(url);

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
      description="YouTube videos, Shorts, playlists, Spotify links, direct audio, or a file upload."
      className="max-w-xl"
    >
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-sand bg-paper p-1">
        {(
          [
            { id: 'link', label: 'Link', icon: Link2 },
            { id: 'upload', label: 'Upload', icon: UploadCloud },
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
              'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
              tab === item.id
                ? 'bg-cream text-ink shadow-[0_1px_2px_rgba(35,32,28,0.08)]'
                : 'text-taupe hover:text-graphite'
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
                <label htmlFor="media-url" className="text-[10px] font-medium uppercase tracking-[0.18em] text-taupe">
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
              <div className="rounded-xl border border-rust/25 bg-rust/5 px-3.5 py-2.5 text-xs text-rust">
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

            <p className="text-center text-[10px] leading-relaxed text-taupe">
              Only real links are queued. YouTube requires the official IFrame player; Spotify
              playback needs a personal Premium account.
            </p>
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
                'flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 transition-colors',
                dragging
                  ? 'border-taupe bg-linen'
                  : 'border-sand bg-paper hover:border-clay hover:bg-linen/60'
              )}
            >
              {uploading ? (
                <Loader2 className="h-7 w-7 animate-spin text-taupe" />
              ) : (
                <UploadCloud className="h-7 w-7 text-taupe" />
              )}
              <div className="text-center">
                <p className="text-sm font-medium text-ink">
                  {uploading ? 'Uploading…' : 'Drop an audio file or click to browse'}
                </p>
                <p className="mt-1 text-[11px] text-taupe">MP3, WAV, OGG, M4A, FLAC · up to 30 MB</p>
              </div>
            </button>

            {error && (
              <div className="rounded-xl border border-rust/25 bg-rust/5 px-3.5 py-2.5 text-xs text-rust">
                {error}
              </div>
            )}

            {uploaded && (
              <div className="flex items-center gap-3 rounded-xl border border-sand bg-paper p-3">
                <div className="grid h-12 w-12 flex-none place-items-center rounded-lg bg-linen">
                  <Music2 className="h-5 w-5 text-graphite" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{uploaded.title}</p>
                  <p className="text-[11px] text-taupe">Ready to queue</p>
                </div>
                <Check className="h-4 w-4 text-forest" />
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

            <p className="text-center text-[10px] leading-relaxed text-taupe">
              Uploads live on the server instance. On serverless hosting they are temporary, so
              prefer links for permanent rooms.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PreviewCard({ preview }: { preview: ResolvedMedia }) {
  const Icon = providerIcon(preview.provider);
  return (
    <div className="overflow-hidden rounded-xl border border-sand bg-paper">
      <div className="flex items-center gap-3 p-3">
        <div className="relative h-16 w-16 flex-none overflow-hidden rounded-lg bg-linen">
          {preview.thumbnail ? (
            <img src={preview.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <Icon className="h-6 w-6 text-taupe" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3 w-3 text-taupe" />
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-taupe">
              {providerLabel(preview.provider)}
              {preview.sourceType ? ` · ${preview.sourceType}` : ''}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-ink">
            {preview.title}
          </p>
          <p className="truncate text-[11px] text-taupe">{preview.artist}</p>
        </div>
        {preview.items.length > 1 && (
          <span className="chip flex-none py-1 text-[10px]">{preview.items.length} tracks</span>
        )}
      </div>
      {preview.warning && (
        <div className="border-t border-rust/20 bg-rust/5 px-3.5 py-2.5 text-[11px] leading-relaxed text-rust">
          {preview.warning}
        </div>
      )}
    </div>
  );
}
