import { useState, useEffect } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crown,
  ListMusic,
  Music2,
  Plus,
  Radio,
  Trash2,
  Users,
  Video,
  Wifi,
  WifiOff,
  UserMinus,
  MoreVertical,
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

const AVATAR_TONES = [
  'bg-ink text-cream',
  'bg-graphite text-cream',
  'bg-slate text-cream',
  'bg-taupe text-cream',
  'bg-clay text-ink',
  'bg-linen text-graphite',
];

function avatarTone(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash + name.charCodeAt(index) * (index + 3)) % 997;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
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
  const [contextMenu, setContextMenu] = useState<{
    userId: string;
    username: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', handleClose);
      window.addEventListener('contextmenu', handleClose);
      window.addEventListener('scroll', handleClose, true);
    }
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener('scroll', handleClose, true);
    };
  }, [contextMenu]);

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
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-[32px] bg-white/[0.035] backdrop-blur-3xl border border-white/[0.1] shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.15)]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3.5 py-3">
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl bg-black/40 p-1 border border-white/[0.06]">
          <button
            type="button"
            onClick={() => setTab('queue')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
              tab === 'queue' ? 'bg-[#fde5b7] text-[#141416] font-semibold shadow-sm' : 'text-[#a8a29e] hover:text-white'
            )}
          >
            <ListMusic className="h-3.5 w-3.5" />
            Queue
            <span className={cn('font-mono text-[10px]', tab === 'queue' ? 'text-black/70' : 'text-[#a8a29e]')}>{room.queue.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('people')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
              tab === 'people' ? 'bg-[#fde5b7] text-[#141416] font-semibold shadow-sm' : 'text-[#a8a29e] hover:text-white'
            )}
          >
            <Users className="h-3.5 w-3.5" />
            People
            <span className={cn('font-mono text-[10px]', tab === 'people' ? 'text-black/70' : 'text-[#a8a29e]')}>
              {room.users.filter((user) => user.isOnline).length}
            </span>
          </button>
        </div>
        {tab === 'queue' && isAdmin && (
          <button
            type="button"
            onClick={onOpenAdd}
            className="h-8 flex-none rounded-xl px-3 text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-[#fde5b7] border border-white/10 transition-all flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5 text-[#40E0D0]" />
            Add
          </button>
        )}
      </div>

      {tab === 'queue' ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 scroll-thin">
            {room.queue.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-xl border border-sand bg-paper">
                  <ListMusic className="h-5 w-5 text-clay" />
                </div>
                <p className="mt-3 text-sm font-medium text-graphite">Queue is empty</p>
                <p className="mt-1 text-[11px] leading-relaxed text-taupe">
                  {isAdmin
                    ? 'Add a real link or upload a file to start the session.'
                    : 'The admin will add the first track soon.'}
                </p>
                {isAdmin && (
                  <button type="button" onClick={onOpenAdd} className="btn btn-ghost mt-3 h-8 px-3 text-[11px] font-semibold text-[#fde5b7]">
                    <Plus className="h-3.5 w-3.5" />
                    Browse Library / Add Track
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-1">
                {room.queue.map((item, index) => {
                  const active = index === room.currentIndex;
                  const ProviderIcon =
                    item.provider === 'youtube' ? Video : item.provider === 'spotify' ? Music2 : Radio;
                  return (
                    <li key={item.id}>
                      <div
                        className={cn(
                          'group relative flex items-center gap-2.5 rounded-lg border p-1.5 pr-2 transition-colors',
                          active
                            ? 'border-clay bg-linen/60'
                            : 'border-transparent hover:border-sand hover:bg-paper'
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
                          className="relative h-10 w-10 flex-none overflow-hidden rounded-md bg-linen"
                          title={isAdmin ? `Play ${item.title}` : item.title}
                        >
                          <img src={item.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                          <span
                            className={cn(
                              'absolute inset-0 grid place-items-center bg-ink/50 transition-opacity',
                              active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            )}
                          >
                            {active ? (
                              <span className="flex items-end gap-[2px]">
                                {[0, 1, 2].map((bar) => (
                                  <span
                                    key={bar}
                                    className="eq-bar w-[2px] rounded-full bg-cream"
                                    style={{
                                      height: `${7 + bar * 3}px`,
                                      animationDelay: `${bar * 120}ms`,
                                      animationDuration: room.playback.status === 'playing' ? undefined : '2s',
                                    }}
                                  />
                                ))}
                              </span>
                            ) : (
                              <span className="font-mono text-[10px] text-cream/90">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                            )}
                          </span>
                        </button>

                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'line-clamp-1 text-[12px] font-medium',
                              active ? 'text-[#fde5b7] font-semibold' : 'text-white'
                            )}
                          >
                            {item.title}
                          </p>
                          <p className="line-clamp-1 text-[10.5px] text-taupe">
                            <ProviderIcon className="mr-1 inline h-2.5 w-2.5 align-[-1px]" />
                            {item.artist}
                          </p>
                        </div>

                        <span className="flex-none font-mono text-[10px] text-taupe">
                          {item.duration > 0 ? formatTime(item.duration) : '--:--'}
                        </span>

                        {isAdmin && (
                          <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-sand bg-cream p-0.5 shadow-sm group-hover:flex">
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
                              className="icon-btn h-5 w-5 rounded hover:text-rust"
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

          <div className="border-t border-sand px-4 py-3">
            <div className="flex items-center justify-between text-[10px] text-taupe">
              <span>
                {room.queue.length} {room.queue.length === 1 ? 'track' : 'tracks'}
                {totalDuration > 0 ? ` · ${formatTime(totalDuration)}` : ''}
              </span>
              {isAdmin && room.queue.length > 0 && (
                <button
                  type="button"
                  onClick={onRequestClear}
                  className="flex items-center gap-1 text-[10px] font-medium text-rust/80 transition-colors hover:text-rust"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-clay">
              {isAdmin ? 'Click a track to jump to it. Hover for reorder controls.' : 'Only the admin can change this queue.'}
            </p>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 scroll-thin">
          <div className="rounded-xl border border-sand bg-paper p-3.5">
            <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-taupe">
              Room code
            </p>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="font-mono text-2xl font-bold tracking-[0.18em] text-[#fde5b7]">
                {room.roomCode}
              </span>
              <button type="button" onClick={() => void copyCode()} className="icon-btn h-8 w-8 text-[#fde5b7]" title="Copy code">
                {copied ? <Check className="h-4 w-4 text-forest" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-2 w-full rounded-lg border border-white/10 bg-[#262629] py-1.5 text-[11px] font-medium text-[#fde5b7] transition-colors hover:bg-[#313136]"
            >
              Copy invite link
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between px-1">
            <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-taupe">
              In the room
            </span>
            <span className="font-mono text-[9px] text-clay">
              {room.users.filter((user) => user.isOnline).length}/{room.users.length}
            </span>
          </div>

          <ul className="mt-1.5 space-y-1">
            {users.map((user) => {
              const isYou = user.id === currentUser.id;
              return (
                <li
                  key={user.id}
                  onContextMenu={(e) => {
                    if (isAdmin && !isYou) {
                      e.preventDefault();
                      setContextMenu({
                        userId: user.id,
                        username: user.username,
                        x: Math.min(window.innerWidth - 200, e.clientX),
                        y: Math.min(window.innerHeight - 130, e.clientY),
                      });
                    }
                  }}
                  className={cn(
                    'group relative flex items-center gap-2.5 rounded-lg border px-2 py-2 transition-colors select-none',
                    isYou ? 'border-sand bg-paper' : 'border-transparent hover:bg-paper/70'
                  )}
                >
                  <div className="relative">
                    <div
                      className={cn(
                        'grid h-8 w-8 place-items-center rounded-full text-[10px] font-semibold',
                        avatarTone(user.username),
                        !user.isOnline && 'opacity-40 grayscale'
                      )}
                    >
                      {initials(user.username)}
                    </div>
                    <span
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-cream',
                        user.isOnline ? 'bg-forest' : 'bg-clay'
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[12px] font-medium text-graphite">{user.username}</p>
                      {isYou && <span className="text-[9px] text-taupe">You</span>}
                      {user.isAdmin && <Crown className="h-3 w-3 text-[#fde5b7]" />}
                    </div>
                    <p className="flex items-center gap-1 text-[9.5px] text-taupe">
                      {user.isOnline ? (
                        <>
                          <Wifi className="h-2.5 w-2.5 text-forest/80" />
                          {user.ping > 0 ? `${Math.round(user.ping)}ms` : 'online'}
                          <span className="text-sand">·</span>
                          <span className={Math.abs(user.drift) < 120 ? 'text-forest/80' : 'text-rust/80'}>
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
                  {user.isAdmin ? (
                    <span className="chip py-0.5 text-[8px] uppercase tracking-wider text-taupe">
                      Admin
                    </span>
                  ) : isAdmin && !isYou ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setContextMenu({
                          userId: user.id,
                          username: user.username,
                          x: Math.min(window.innerWidth - 200, e.clientX),
                          y: Math.min(window.innerHeight - 130, e.clientY),
                        });
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-taupe hover:text-white transition-all"
                      title="Manage listener (Right click also works)"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>


        </div>
      )}

      {/* Admin Right-Click Context Menu */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 w-48 rounded-2xl border border-white/10 bg-[#212124] p-1.5 shadow-2xl text-[#fde5b7]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-white/5 mb-1 text-[11px] font-semibold text-[#a8a29e] truncate">
            {contextMenu.username}
          </div>
          <button
            type="button"
            onClick={() => {
              socket.emit('room:make_admin', {
                roomCode: room.roomCode,
                targetUserId: contextMenu.userId,
              });
              notify('Host changed', `${contextMenu.username} is now the room admin.`, 'success');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium rounded-xl hover:bg-white/5 hover:text-white transition-colors"
          >
            <Crown className="w-3.5 h-3.5 text-[#fde5b7]" />
            <span>Make Admin</span>
          </button>
          <button
            type="button"
            onClick={() => {
              socket.emit('room:kick', {
                roomCode: room.roomCode,
                targetUserId: contextMenu.userId,
              });
              notify('Removed', `${contextMenu.username} was kicked from the room.`, 'error');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <UserMinus className="w-3.5 h-3.5" />
            <span>Kick from Room</span>
          </button>
        </div>
      )}
    </aside>
  );
}
