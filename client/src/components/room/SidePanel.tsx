import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crown,
  ListMusic,
  Plus,
  Radio,
  Trash2,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { RoomState, RoomUser } from '../../types.js';
import { cn } from '../../lib/cn.js';
import { formatTime, initials } from '../../lib/format.js';
import { socket } from '../../services/socket.js';

interface SidePanelProps {
  room: RoomState;
  currentUser: RoomUser;
  isAdmin: boolean;
  onOpenAdd: () => void;
  onRequestClear: () => void;
  notify: (title: string, description?: string, tone?: 'info' | 'success' | 'error') => void;
}

type Tab = 'queue' | 'people';

const AVATAR_GRADIENTS = [
  'from-violet-500 to-fuchsia-500',
  'from-cyan-400 to-blue-500',
  'from-pink-500 to-rose-500',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-indigo-400 to-violet-500',
];

function avatarGradient(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash + name.charCodeAt(index) * (index + 3)) % 997;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

export function SidePanel({
  room,
  currentUser,
  isAdmin,
  onOpenAdd,
  onRequestClear,
  notify,
}: SidePanelProps) {
  const [tab, setTab] = useState<Tab>('queue');
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopied(true);
      notify('Room code copied', `Share ${room.roomCode} so others can join.`, 'success');
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      notify('Copy failed', 'Select the code and copy it manually.', 'error');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${room.roomCode}`);
      notify('Invite link copied', 'Anyone with the link can join this room.', 'success');
    } catch {
      notify('Copy failed', 'Copy the room code instead.', 'error');
    }
  };

  const totalDuration = room.queue.reduce((sum, item) => sum + (item.duration || 0), 0);
  const users = [...room.users].sort((a, b) => {
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return a.username.localeCompare(b.username);
  });

  return (
    <aside className="panel flex min-h-0 flex-col overflow-hidden rounded-[26px]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl border border-white/[0.06] bg-black/30 p-1">
          <button
            type="button"
            onClick={() => setTab('queue')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors',
              tab === 'queue' ? 'bg-white/[0.08] text-white' : 'text-white/45 hover:text-white/70'
            )}
          >
            <ListMusic className="h-3.5 w-3.5" />
            Queue
            <span className="font-mono text-[10px] text-white/35">{room.queue.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('people')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors',
              tab === 'people' ? 'bg-white/[0.08] text-white' : 'text-white/45 hover:text-white/70'
            )}
          >
            <Users className="h-3.5 w-3.5" />
            People
            <span className="font-mono text-[10px] text-white/35">
              {room.users.filter((user) => user.isOnline).length}
            </span>
          </button>
        </div>
        {tab === 'queue' && isAdmin && (
          <button
            type="button"
            onClick={onOpenAdd}
            className="btn btn-primary h-8 flex-none rounded-lg px-2.5 text-[11px]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        )}
      </div>

      {tab === 'queue' ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 scroll-thin">
            {room.queue.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03]">
                  <ListMusic className="h-5 w-5 text-white/30" />
                </div>
                <p className="mt-3 text-sm font-semibold text-white/80">Queue is empty</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/35">
                  {isAdmin
                    ? 'Add links, playlists, or files to start the session.'
                    : 'The admin will add the first track soon.'}
                </p>
                {isAdmin && (
                  <button type="button" onClick={onOpenAdd} className="btn btn-ghost mt-3 h-8 px-3 text-[11px]">
                    <Plus className="h-3.5 w-3.5" />
                    Add media
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-1">
                {room.queue.map((item, index) => {
                  const active = index === room.currentIndex;
                  const ProviderIcon =
                    item.provider === 'youtube' ? Radio : item.provider === 'spotify' ? Radio : Radio;
                  return (
                    <li key={item.id}>
                      <div
                        className={cn(
                          'group relative flex items-center gap-2.5 rounded-xl border p-1.5 pr-2 transition-colors',
                          active
                            ? 'border-violet-400/25 bg-violet-500/[0.08]'
                            : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.03]'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (!isAdmin) {
                              notify('Admin only', 'Only the room admin can jump between tracks.', 'info');
                              return;
                            }
                            socket.emit('queue:play_index', { roomCode: room.roomCode, index });
                          }}
                          className="relative h-10 w-10 flex-none overflow-hidden rounded-lg"
                          title={isAdmin ? `Play ${item.title}` : item.title}
                        >
                          <img src={item.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                          <span
                            className={cn(
                              'absolute inset-0 grid place-items-center bg-black/45 transition-opacity',
                              active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            )}
                          >
                            {active ? (
                              <span className="flex items-end gap-[2px]">
                                {[0, 1, 2].map((bar) => (
                                  <span
                                    key={bar}
                                    className="eq-bar w-[2px] rounded-full bg-white"
                                    style={{
                                      height: `${7 + bar * 3}px`,
                                      animationDelay: `${bar * 120}ms`,
                                      animationDuration: room.playback.status === 'playing' ? undefined : '2s',
                                    }}
                                  />
                                ))}
                              </span>
                            ) : (
                              <span className="font-mono text-[10px] text-white/80">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                            )}
                          </span>
                        </button>

                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'line-clamp-1 text-[12px] font-medium',
                              active ? 'text-white' : 'text-white/80'
                            )}
                          >
                            {item.title}
                          </p>
                          <p className="line-clamp-1 text-[10.5px] text-white/35">
                            <ProviderIcon className="mr-1 inline h-2.5 w-2.5 align-[-1px]" />
                            {item.artist}
                          </p>
                        </div>

                        <span className="flex-none font-mono text-[10px] text-white/30">
                          {item.duration > 0 ? formatTime(item.duration) : '--:--'}
                        </span>

                        {isAdmin && (
                          <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg border border-white/10 bg-[#0b0b12]/95 p-0.5 shadow-lg group-hover:flex">
                            <button
                              type="button"
                              onClick={() => socket.emit('queue:reorder', { roomCode: room.roomCode, fromIndex: index, toIndex: index - 1 })}
                              disabled={index === 0}
                              className="icon-btn h-5 w-5 rounded"
                              title="Move up"
                              aria-label="Move up"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => socket.emit('queue:reorder', { roomCode: room.roomCode, fromIndex: index, toIndex: index + 1 })}
                              disabled={index === room.queue.length - 1}
                              className="icon-btn h-5 w-5 rounded"
                              title="Move down"
                              aria-label="Move down"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => socket.emit('queue:remove', { roomCode: room.roomCode, itemId: item.id })}
                              className="icon-btn h-5 w-5 rounded hover:text-rose-300"
                              title="Remove"
                              aria-label="Remove from queue"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-white/[0.06] px-4 py-3">
            <div className="flex items-center justify-between text-[10px] text-white/35">
              <span>
                {room.queue.length} {room.queue.length === 1 ? 'track' : 'tracks'}
                {totalDuration > 0 ? ` · ${formatTime(totalDuration)}` : ''}
              </span>
              {isAdmin && room.queue.length > 0 && (
                <button
                  type="button"
                  onClick={onRequestClear}
                  className="flex items-center gap-1 text-[10px] font-medium text-rose-300/70 transition-colors hover:text-rose-300"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-white/22">
              {isAdmin ? 'Click a track to jump to it. Hover for reorder controls.' : 'Only the admin can change this queue.'}
            </p>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 scroll-thin">
          <div className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.12] to-cyan-500/[0.06] p-3.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-violet-200/60">
              Room code
            </p>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="font-mono text-2xl font-semibold tracking-[0.18em] text-white">
                {room.roomCode}
              </span>
              <button type="button" onClick={() => void copyCode()} className="icon-btn h-8 w-8" title="Copy code">
                {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.04] py-1.5 text-[10px] font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              Copy invite link
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between px-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/35">
              In the room
            </span>
            <span className="font-mono text-[9px] text-white/25">
              {room.users.filter((user) => user.isOnline).length}/{room.users.length}
            </span>
          </div>

          <ul className="mt-1.5 space-y-1">
            {users.map((user) => {
              const isYou = user.id === currentUser.id;
              return (
                <li
                  key={user.id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-2 py-2',
                    isYou
                      ? 'border-white/[0.09] bg-white/[0.04]'
                      : 'border-transparent hover:bg-white/[0.025]'
                  )}
                >
                  <div className="relative">
                    <div
                      className={cn(
                        'grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white',
                        avatarGradient(user.username),
                        !user.isOnline && 'opacity-40 grayscale'
                      )}
                    >
                      {initials(user.username)}
                    </div>
                    <span
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0d0d15]',
                        user.isOnline ? 'bg-emerald-400' : 'bg-white/25'
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[12px] font-medium text-white/85">{user.username}</p>
                      {isYou && <span className="text-[9px] text-white/30">You</span>}
                      {user.isAdmin && <Crown className="h-3 w-3 text-amber-300" />}
                    </div>
                    <p className="flex items-center gap-1 text-[9.5px] text-white/30">
                      {user.isOnline ? (
                        <>
                          <Wifi className="h-2.5 w-2.5 text-emerald-300/70" />
                          {user.ping > 0 ? `${Math.round(user.ping)}ms` : 'online'}
                          <span className="text-white/15">·</span>
                          <span className={Math.abs(user.drift) < 120 ? 'text-emerald-300/60' : 'text-amber-300/60'}>
                            {Math.round(user.drift)}ms drift
                          </span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-2.5 w-2.5" />
                          reconnecting…
                        </>
                      )}
                    </p>
                  </div>
                  {user.isAdmin && (
                    <span className="chip border-amber-300/20 py-0.5 text-[8px] uppercase tracking-wider text-amber-200/70">
                      Admin
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] font-semibold text-white/55">Seats survive refresh</p>
            <p className="mt-1 text-[9.5px] leading-relaxed text-white/30">
              A dropped listener keeps their name for 25 seconds. A deliberate leave frees it
              immediately.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
