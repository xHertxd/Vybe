import React from 'react';
import type { Track } from '@vybe/shared';
import { ListMusic, Trash2, Plus, Play, Music } from 'lucide-react';
import { formatSeconds } from '../lib/format.js';

interface QueueListProps {
  queue: Track[];
  queueIndex: number;
  onRemoveTrack: (trackId: string) => void;
  onOpenSearch: () => void;
}

export const QueueList: React.FC<QueueListProps> = ({
  queue,
  queueIndex,
  onRemoveTrack,
  onOpenSearch,
}) => {
  return (
    <div className="glass-panel w-full rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListMusic className="h-4 w-4 text-brand-400" />
          <h3 className="font-bold text-sm text-white">Up Next ({queue.length})</h3>
        </div>
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-1 rounded-xl bg-white/5 border border-white/10 px-2.5 py-1 text-xs font-medium text-brand-300 hover:bg-white/10 transition-all hover:border-white/20 active:scale-95"
        >
          <Plus className="h-3 w-3" />
          <span>Add Track</span>
        </button>
      </div>

      {queue.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500">
          No songs queued yet. Click Add Track to populate the queue.
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {queue.map((track, idx) => {
            const isCurrent = idx === queueIndex;
            return (
              <div
                key={track.id + idx}
                className={`group flex items-center justify-between rounded-xl px-3 py-2.5 transition-all ${
                  isCurrent
                    ? 'bg-brand-500/15 border border-brand-500/30'
                    : 'bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg overflow-hidden shrink-0 bg-zinc-800 flex items-center justify-center">
                    {track.coverUrl ? (
                      <img src={track.coverUrl} alt={track.title} className="h-full w-full object-cover" />
                    ) : (
                      <Music className="h-4 w-4 text-zinc-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate ${isCurrent ? 'text-brand-200' : 'text-zinc-200'}`}>
                      {track.title}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">{track.artist}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {isCurrent ? (
                    <span className="flex items-center gap-1 font-mono text-[10px] text-brand-400 font-medium">
                      <Play className="h-2.5 w-2.5 fill-current" />
                      Playing
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-zinc-500">
                      {formatSeconds(track.duration)}
                    </span>
                  )}
                  <button
                    onClick={() => onRemoveTrack(track.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all p-1"
                    title="Remove from queue"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

