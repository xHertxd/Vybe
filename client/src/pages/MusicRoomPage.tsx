import { useEffect, useMemo, useState } from 'react';
import {
  Check, Copy, Crown, LogOut, Pause, Play, Power, Share2, Users,
} from 'lucide-react';
import type { RoomState, RoomUser } from '../types.js';
import { useMediaPlayer } from '../hooks/useMediaPlayer.js';
import { clockSync } from '../services/clockSync.js';
import { keepAlive } from '../services/keepAlive.js';
import { socket } from '../services/socket.js';
import { spotify } from '../services/spotify.js';
import { Brand } from '../components/Brand.js';
import { Footer } from '../components/Footer.js';
import { NowPlayingCard } from '../components/room/NowPlayingCard.js';
import { MusicLibrary } from '../components/room/MusicLibrary.js';
import { SidePanel } from '../components/room/SidePanel.js';
import { AddMediaModal } from '../components/AddMediaModal.js';
import { ConfirmDialog } from '../components/Modal.js';
import { cn } from '../lib/cn.js';
import { initials } from '../lib/format.js';

interface MusicRoomPageProps {
  room: RoomState;
  currentUser: RoomUser;
  onLeave: () => void;
  onEndRoom: () => void;
  notify: (title: string, description?: string, tone?: 'info' | 'success' | 'error') => void;
}

export function MusicRoomPage({
  room,
  currentUser,
  onLeave,
  onEndRoom,
  notify,
}: MusicRoomPageProps) {
  const isAdmin = currentUser.isAdmin;
  const [addOpen, setAddOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [confirm, setConfirm] = useState<'clear' | 'end' | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [theater, setTheater] = useState(() => localStorage.getItem('vybe_theater') === '1');
  const [youtubeMode, setYouTubeMode] = useState<'video' | 'audio'>(() =>
    localStorage.getItem('vybe_youtube_mode') === 'video' ? 'video' : 'audio'
  );
  const [volume, setVolume] = useState(() => {
    const stored = Number(localStorage.getItem('vybe_volume'));
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.8;
  });
  const [clock, setClock] = useState(() => clockSync.getMetrics());
  const spotifyVersion = 0;
  const [, setSpotifyProfile] = useState<{ name: string; premium: boolean } | null>(null);

  const spotifyConnected = spotify.isConnected();
  const track = room.playback.currentTrack;
  const isPlaying = room.playback.status === 'playing';

  const canControl = isAdmin || room.settings.playbackControl === 'anyone' || !room.users.some((u) => u.isAdmin && u.isOnline);

  const handleTogglePlay = () => {
    if (!track) return;
    void player.activate();
    if (canControl) {
      if (isPlaying) {
        socket.emit('playback:pause', { roomCode: room.roomCode });
      } else {
        socket.emit('playback:play', { roomCode: room.roomCode });
      }
    } else {
      if (!isPlaying) {
        notify('Paused by Host', 'Waiting for host to start playback.', 'info');
      } else {
        notify('Locked in Sync', 'Your device is locked to room playback.', 'success');
      }
    }
  };

  const player = useMediaPlayer({
    track,
    playback: room.playback,
    roomCode: room.roomCode,
    volume,
    spotifyConnected,
    spotifyVersion,
    crossfade: room.settings.crossfade ?? 4,
  });

  useEffect(() => clockSync.subscribe(setClock), []);
  useEffect(() => { keepAlive.start(room.roomCode); return () => keepAlive.stop(); }, [room.roomCode]);
  useEffect(() => { localStorage.setItem('vybe_theater', theater ? '1' : '0'); }, [theater]);
  useEffect(() => { localStorage.setItem('vybe_youtube_mode', youtubeMode); }, [youtubeMode]);
  useEffect(() => { localStorage.setItem('vybe_volume', String(volume)); }, [volume]);
  useEffect(() => {
    let cancelled = false;
    if (!spotifyConnected) { setSpotifyProfile(null); return; }
    void spotify.getProfile().then((profile) => {
      if (cancelled) return;
      setSpotifyProfile(profile);
      if (profile && !profile.premium) {
        notify('Spotify Premium required', 'Playback in third-party players needs Premium.', 'info');
      }
    });
    return () => { cancelled = true; };
  }, [spotifyConnected, spotifyVersion, notify]);

  const onlineUsers = useMemo(() => room.users.filter((user) => user.isOnline), [room.users]);
  const latency = Math.max(1, Math.round((clock.rtt || 0) / 2));
  const drift = Math.abs(player.driftMs);
  const inSync = drift < 250;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopiedCode(true);
      notify('Room code copied', `${room.roomCode} copied to clipboard.`, 'success');
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      notify('Copy failed', 'Copy the room code manually.', 'error');
    }
  };

  const shareRoom = async () => {
    const url = `${window.location.origin}/room/${room.roomCode}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join my Vybe room', text: 'Same beat, every device.', url });
      } else {
        await navigator.clipboard.writeText(url);
        notify('Invite link copied', 'Send it to anyone you want in the room.', 'success');
      }
    } catch {}
  };

  const connectSpotify = () => {
    void spotify
      .beginAuth(window.location.pathname + window.location.search)
      .catch((error: unknown) =>
        notify('Spotify unavailable', error instanceof Error ? error.message : 'Could not open Spotify sign-in.', 'error')
      );
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-[#0a0a0a] text-white select-none font-sans overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0a0a]/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Brand size="sm" onClick={onLeave} />
            <div className="hidden h-5 w-px bg-white/5 sm:block" />
            <button
              type="button"
              onClick={copyCode}
              className="group flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1.5 transition-all hover:border-white/10 hover:bg-white/[0.05]"
              title="Click to copy room code"
            >
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#737373]">Room</span>
              <span className="font-mono text-sm font-bold tracking-wider text-white">{room.roomCode}</span>
              {copiedCode ? <Check className="h-3.5 w-3.5 text-[#22c55e]" /> : <Copy className="h-3.5 w-3.5 text-[#737373] group-hover:text-white" />}
            </button>
            <button type="button" onClick={shareRoom} className="hidden h-8 w-8 items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] text-[#737373] hover:text-white hover:border-white/10 transition-all sm:inline-flex" title="Share room link" aria-label="Share room"><Share2 className="h-3.5 w-3.5" /></button>
          </div>

          <div className="flex items-center gap-2">
            {/* Sync Status */}
            <div className="hidden items-center gap-1.5 rounded-full border border-[#22c55e]/20 bg-[#22c55e]/5 px-3 py-1 text-[11px] font-medium text-[#22c55e] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] animate-pulse" />
              <span>{inSync ? `${latency}ms · Synced` : `${drift}ms drift`}</span>
            </div>

            <div className="hidden items-center gap-1.5 text-xs text-[#737373] sm:flex px-2.5 py-1 bg-white/[0.02] rounded-xl border border-white/5">
              <Users className="h-3.5 w-3.5 text-white" />
              <span>{onlineUsers.length} {onlineUsers.length === 1 ? 'listener' : 'listeners'}</span>
            </div>

            {/* User Avatar & Role */}
            <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
              <div className="grid h-6 w-6 place-items-center rounded-lg bg-white text-[10px] font-black text-black">{initials(currentUser.username)}</div>
              <div className="hidden pr-1 sm:block">
                <p className="max-w-[110px] truncate text-xs font-semibold leading-tight text-white">{currentUser.username}</p>
                <p className="flex items-center gap-1 text-[9px] font-medium text-[#737373]">
                  {isAdmin ? (
                    <> <Crown className="h-2.5 w-2.5 text-white" /> Host </>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span>Listener</span>
                      {(!room.users.some((u) => u.isAdmin && u.isOnline) || onlineUsers.length <= 1) && (
                        <button type="button" onClick={() => { socket.emit('room:claim_admin', { roomCode: room.roomCode }); notify('Host claimed', 'You are now the room host!', 'success'); }} className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-white font-bold text-[8px] transition-all cursor-pointer">Claim Host</button>
                      )}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Play/Pause */}
            {track && (
              <button
                type="button"
                onClick={handleTogglePlay}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-md active:scale-95 cursor-pointer',
                  isPlaying
                    ? 'border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e] hover:bg-[#22c55e]/20'
                    : 'border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.1]'
                )}
                title={canControl ? (isPlaying ? 'Pause playback (Space)' : 'Start playback (Space)') : isPlaying ? 'Locked in Sync' : 'Waiting for host'}
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                <span className="hidden md:inline">{isPlaying ? 'Pause' : 'Play'}</span>
              </button>
            )}

            {isAdmin && (
              <button type="button" onClick={() => setConfirm('end')} className="h-8 w-8 items-center justify-center rounded-xl border border-red-500/15 bg-red-500/5 text-red-400 hover:bg-red-500/10 transition-all flex" title="End room for all" aria-label="End room"><Power className="h-3.5 w-3.5" /></button>
            )}

            <button type="button" onClick={onLeave} className="flex items-center gap-1.5 h-8 rounded-xl border border-white/5 bg-white/[0.02] px-3 text-xs text-[#737373] hover:text-white hover:border-white/10 transition-all" title="Leave room"><LogOut className="h-3.5 w-3.5" /><span className="hidden sm:inline">Leave</span></button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className={cn('grid items-start gap-6', !theater && 'lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]')}>
          <div className="min-w-0 space-y-6">
            {/* Now Playing Card */}
            <NowPlayingCard
              room={room}
              currentUser={currentUser}
              isAdmin={isAdmin}
              player={player}
              volume={volume}
              onVolumeChange={setVolume}
              youtubeMode={youtubeMode}
              onYouTubeModeChange={setYouTubeMode}
              theater={theater}
              onToggleTheater={() => setTheater((v) => !v)}
              spotifyConnected={spotify.isConnected()}
              spotifyConfigured={spotify.configured}
              onConnectSpotify={connectSpotify}
              onOpenAdd={() => setLibraryOpen(true)}
              notify={notify}
            />
          </div>

          {/* Side Panel */}
          {!theater && (
            <SidePanel
              room={room}
              currentUser={currentUser}
              isAdmin={isAdmin}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              onOpenAdd={() => setLibraryOpen(true)}
              onRequestClear={() => setConfirm('clear')}
              notify={notify}
            />
          )}
        </div>
      </main>

      <Footer compact />

      {/* Modals */}
      <MusicLibrary isOpen={libraryOpen} onClose={() => setLibraryOpen(false)} notify={notify} />
      <AddMediaModal open={addOpen} onClose={() => setAddOpen(false)} notify={notify} />
      <ConfirmDialog open={confirm === 'clear'} title="Clear the queue?" description="All upcoming tracks will be removed from the room." confirmLabel="Clear queue" danger onConfirm={() => { socket.emit('queue:clear', { roomCode: room.roomCode }); notify('Queue cleared', 'All tracks removed.', 'info'); setConfirm(null); }} onClose={() => setConfirm(null)} />
      <ConfirmDialog open={confirm === 'end'} title="End this session?" description="The room will be closed and every listener will be disconnected." confirmLabel="End room" danger onConfirm={() => { onEndRoom(); setConfirm(null); }} onClose={() => setConfirm(null)} />
    </div>
  );
}