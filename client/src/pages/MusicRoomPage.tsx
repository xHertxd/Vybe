import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  LogOut,
  Power,
  Share2,
  Users,
} from 'lucide-react';
import type { RoomState, RoomUser } from '../types.js';
import { useMediaPlayer } from '../hooks/useMediaPlayer.js';
import { clockSync } from '../services/clockSync.js';
import { socket } from '../services/socket.js';
import { spotify } from '../services/spotify.js';
import { Brand } from '../components/Brand.js';
import { Footer } from '../components/Footer.js';
import { NowPlayingCard } from '../components/room/NowPlayingCard.js';
import { InlineSearch } from '../components/room/InlineSearch.js';
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

const YOUTUBE_MODE_KEY = 'vybe_youtube_mode';
const THEATER_KEY = 'vybe_theater';
const VOLUME_KEY = 'vybe_volume';

export function MusicRoomPage({
  room,
  currentUser,
  onLeave,
  onEndRoom,
  notify,
}: MusicRoomPageProps) {
  const isAdmin = currentUser.isAdmin;
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState<'clear' | 'end' | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [theater, setTheater] = useState(() => localStorage.getItem(THEATER_KEY) === '1');
  const [youtubeMode, setYouTubeMode] = useState<'video' | 'audio'>(
    () => (localStorage.getItem(YOUTUBE_MODE_KEY) === 'audio' ? 'audio' : 'video')
  );
  const [volume, setVolume] = useState(() => {
    const stored = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.8;
  });
  const [clock, setClock] = useState(() => clockSync.getMetrics());
  const spotifyVersion = 0;
  const [, setSpotifyProfile] = useState<{ name: string; premium: boolean } | null>(null);

  const spotifyConnected = spotify.isConnected();
  const track = room.playback.currentTrack;

  const player = useMediaPlayer({
    track,
    playback: room.playback,
    roomCode: room.roomCode,
    volume,
    spotifyConnected,
    spotifyVersion,
  });

  useEffect(() => clockSync.subscribe(setClock), []);

  useEffect(() => {
    localStorage.setItem(THEATER_KEY, theater ? '1' : '0');
  }, [theater]);

  useEffect(() => {
    localStorage.setItem(YOUTUBE_MODE_KEY, youtubeMode);
  }, [youtubeMode]);

  useEffect(() => {
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  useEffect(() => {
    let cancelled = false;
    if (!spotifyConnected) {
      setSpotifyProfile(null);
      return;
    }
    void spotify.getProfile().then((profile) => {
      if (cancelled) return;
      setSpotifyProfile(profile);
      if (profile && !profile.premium) {
        notify(
          'Spotify Premium required',
          'Your Spotify account is connected, but playback in third-party players needs Premium.',
          'info'
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [spotifyConnected, spotifyVersion, notify]);

  const onlineUsers = useMemo(() => room.users.filter((user) => user.isOnline), [room.users]);
  const latency = Math.max(1, Math.round(clock.rtt / 2));

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopiedCode(true);
      notify('Room code copied', `${room.roomCode} is on your clipboard.`, 'success');
      window.setTimeout(() => setCopiedCode(false), 1_800);
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
    } catch {
      // Sharing was cancelled
    }
  };

  const connectSpotify = () => {
    void spotify
      .beginAuth(window.location.pathname + window.location.search)
      .catch((error: unknown) =>
        notify(
          'Spotify unavailable',
          error instanceof Error ? error.message : 'Could not open Spotify sign-in.',
          'error'
        )
      );
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-[#171719] text-[#fde5b7] select-none">
      {/* ------------------------------------------------------------- header -- */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#171719]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Brand size="sm" />
            <div className="hidden h-5 w-px bg-white/10 sm:block" />
            <button
              type="button"
              onClick={() => void copyCode()}
              className="group flex items-center gap-2 rounded-xl border border-white/10 bg-[#262629] px-3 py-1.5 transition-all hover:border-[#fde5b7]/40 hover:bg-[#2c2c30]"
              title="Click to copy room code"
            >
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#a8a29e]">
                Room
              </span>
              <span className="font-mono text-sm font-bold tracking-wider text-[#fde5b7]">
                {room.roomCode}
              </span>
              {copiedCode ? (
                <Check className="h-3.5 w-3.5 text-[#86efac]" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-[#a8a29e] group-hover:text-white" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void shareRoom()}
              className="hidden h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-[#262629] text-[#a8a29e] hover:text-[#fde5b7] hover:border-[#fde5b7]/30 transition-all sm:inline-flex"
              title="Share room link"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-[11px] font-medium text-[#86efac] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#86efac] animate-pulse" />
              <span>{latency ? `${latency}ms · Synced` : 'Synced'}</span>
            </span>

            <div className="hidden items-center gap-1.5 text-xs text-[#a8a29e] sm:flex px-2 py-1 bg-[#262629] rounded-xl border border-white/5">
              <Users className="h-3.5 w-3.5 text-[#fde5b7]" />
              <span>{onlineUsers.length} {onlineUsers.length === 1 ? 'listener' : 'listeners'}</span>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#262629] px-2.5 py-1.5">
              <div className="grid h-6 w-6 place-items-center rounded-lg bg-[#fde5b7] text-[10px] font-black text-black">
                {initials(currentUser.username)}
              </div>
              <div className="hidden pr-1 sm:block">
                <p className="max-w-[110px] truncate text-xs font-semibold leading-tight text-[#fde5b7]">
                  {currentUser.username}
                </p>
                <p className="flex items-center gap-1 text-[9px] font-medium text-[#a8a29e]">
                  {isAdmin ? (
                    <>
                      <Crown className="h-2.5 w-2.5 text-[#fde5b7]" />
                      Host
                    </>
                  ) : (
                    'Listener'
                  )}
                </p>
              </div>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setConfirm('end')}
                className="h-8 w-8 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-all flex"
                title="End room for all"
              >
                <Power className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onLeave}
              className="flex items-center gap-1.5 h-8 rounded-xl border border-white/10 bg-[#262629] px-3 text-xs text-[#a8a29e] hover:text-[#fde5b7] hover:border-[#fde5b7]/30 transition-all"
              title="Leave room"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------- main -- */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div
          className={cn(
            'grid items-start gap-6',
            !theater && 'lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]'
          )}
        >
          {/* Main Area: Search + Now Playing Player */}
          <div className="min-w-0 space-y-6">
            {/* Inline Music Search & Library */}
            <InlineSearch notify={notify} />

            {/* Now Playing Showcase Card */}
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
              onToggleTheater={() => setTheater((value) => !value)}
              spotifyConnected={spotifyConnected}
              spotifyConfigured={spotify.configured}
              onConnectSpotify={connectSpotify}
              onOpenAdd={() => setAddOpen(true)}
            />
          </div>

          {/* Side Panel: Up Next Queue & Listeners */}
          {!theater && (
            <SidePanel
              room={room}
              currentUser={currentUser}
              isAdmin={isAdmin}
              onOpenAdd={() => setAddOpen(true)}
              onRequestClear={() => setConfirm('clear')}
              notify={notify}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <Footer compact />

      {/* Modals */}
      <AddMediaModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        notify={notify}
      />

      <ConfirmDialog
        open={confirm === 'clear'}
        title="Clear the queue?"
        description="All upcoming tracks will be removed from the room."
        confirmLabel="Clear queue"
        danger
        onConfirm={() => {
          socket.emit('queue:clear', { roomCode: room.roomCode });
          notify('Queue cleared', 'All tracks removed from the room.', 'info');
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === 'end'}
        title="End this session?"
        description="The room will be closed and every listener will be disconnected."
        confirmLabel="End room"
        danger
        onConfirm={() => {
          onEndRoom();
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
