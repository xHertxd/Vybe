import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  LogOut,
  Power,
  Share2,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { RoomState, RoomUser } from '../types.js';
import type { RoomPhase } from '../hooks/useRoomSession.js';
import { useMediaPlayer } from '../hooks/useMediaPlayer.js';
import { clockSync } from '../services/clockSync.js';
import { socket } from '../services/socket.js';
import { spotify } from '../services/spotify.js';
import { Brand } from '../components/Brand.js';
import { AuroraBackground } from '../components/AuroraBackground.js';
import { NowPlayingCard } from '../components/room/NowPlayingCard.js';
import { SidePanel } from '../components/room/SidePanel.js';
import { AddMediaModal } from '../components/AddMediaModal.js';
import { ConfirmDialog } from '../components/Modal.js';
import { cn } from '../lib/cn.js';
import { initials } from '../lib/format.js';

interface MusicRoomPageProps {
  room: RoomState;
  currentUser: RoomUser;
  phase: RoomPhase;
  connected: boolean;
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
  phase,
  connected,
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
  const [spotifyProfile, setSpotifyProfile] = useState<{ name: string; premium: boolean } | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotifyConnected, spotifyVersion]);

  const onlineUsers = useMemo(() => room.users.filter((user) => user.isOnline), [room.users]);
  const adminUser = room.users.find((user) => user.isAdmin);
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
      // Sharing was cancelled or unsupported; no need to surface an error.
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

  const reconnectBanner = !connected || phase === 'reconnecting';

  return (
    <div className="relative min-h-screen">
      <AuroraBackground dense />

      {/* ------------------------------------------------------------- header -- */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#06060a]/72 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1580px] items-center justify-between gap-3 px-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Brand size="sm" />
            <div className="hidden h-7 w-px bg-white/10 sm:block" />
            <button
              type="button"
              onClick={() => void copyCode()}
              className="group flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 transition-colors hover:border-white/15 hover:bg-white/[0.06]"
              title="Copy room code"
            >
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/30">
                Room
              </span>
              <span className="font-mono text-[13px] font-semibold tracking-[0.16em] text-white">
                {room.roomCode}
              </span>
              {copiedCode ? (
                <Check className="h-3 w-3 text-emerald-300" />
              ) : (
                <Copy className="h-3 w-3 text-white/30 group-hover:text-white/60" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void shareRoom()}
              className="icon-btn hidden h-8 w-8 sm:inline-flex"
              title="Share room"
              aria-label="Share room"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium sm:flex',
                reconnectBanner
                  ? 'border-amber-300/25 bg-amber-400/10 text-amber-200'
                  : 'border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-200/90'
              )}
            >
              {reconnectBanner ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
              {reconnectBanner ? 'Reconnecting' : `${latency}ms · synced`}
            </span>

            <div className="hidden items-center -space-x-2 md:flex">
              {onlineUsers.slice(0, 4).map((user) => (
                <div
                  key={user.id}
                  className={cn(
                    'grid h-7 w-7 place-items-center rounded-full border-2 border-[#06060a] bg-gradient-to-br text-[9px] font-bold text-white',
                    user.isAdmin ? 'from-amber-400 to-orange-500' : 'from-violet-500 to-fuchsia-500'
                  )}
                  title={user.username}
                >
                  {initials(user.username)}
                </div>
              ))}
              {onlineUsers.length > 4 && (
                <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#06060a] bg-white/10 text-[9px] font-semibold text-white/60">
                  +{onlineUsers.length - 4}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.03] px-1.5 py-1">
              <div className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-[9px] font-bold text-white">
                {initials(currentUser.username)}
              </div>
              <div className="hidden pr-1 sm:block">
                <p className="max-w-[100px] truncate text-[11px] font-semibold leading-tight text-white">
                  {currentUser.username}
                </p>
                <p className="flex items-center gap-0.5 text-[8.5px] leading-tight text-white/35">
                  {isAdmin ? (
                    <>
                      <Crown className="h-2.5 w-2.5 text-amber-300" />
                      Admin
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
                className="icon-btn h-8 w-8 hover:bg-rose-500/10 hover:text-rose-300"
                title="End room"
                aria-label="End room"
              >
                <Power className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onLeave}
              className="btn btn-ghost h-8 rounded-lg px-2.5 text-[11px]"
              title="Leave room"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        </div>

        {reconnectBanner && (
          <div className="border-t border-amber-300/15 bg-amber-400/[0.06] px-4 py-1.5 text-center text-[10.5px] text-amber-200/80">
            Connection lost — reconnecting. Your seat is being held and playback will re-align
            automatically.
          </div>
        )}
      </header>

      {/* --------------------------------------------------------------- main -- */}
      <main className="mx-auto w-full max-w-[1580px] px-3 pb-10 pt-4 sm:px-5 sm:pt-5 lg:px-8">
        <div
          className={cn(
            'grid items-start gap-4 lg:gap-5',
            !theater && 'lg:grid-cols-[minmax(0,1fr)_350px] xl:grid-cols-[minmax(0,1fr)_390px]'
          )}
        >
          <div className="min-w-0 space-y-4">
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

            <div className="panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05]">
                  <ShieldCheck className="h-4 w-4 text-emerald-300/80" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-white/70">
                    {isAdmin ? 'You are running this room' : `${adminUser?.username || 'The admin'} is running this room`}
                  </p>
                  <p className="text-[10px] text-white/30">
                    {isAdmin
                      ? 'Playback, queue and settings are locked to you.'
                      : 'Only the admin can change playback. Your volume stays local.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {spotify.configured && (
                  <button
                    type="button"
                    onClick={connectSpotify}
                    className={cn(
                      'btn h-8 rounded-lg px-3 text-[11px]',
                      spotifyConnected ? 'btn-ghost' : 'btn-ghost'
                    )}
                    title="Connect Spotify Premium for Spotify links"
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        spotifyConnected ? 'bg-emerald-400' : 'bg-white/30'
                      )}
                    />
                    {spotifyConnected
                      ? spotifyProfile?.name
                        ? `Spotify · ${spotifyProfile.name}`
                        : 'Spotify connected'
                      : 'Connect Spotify'}
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="btn btn-primary h-8 rounded-lg px-3 text-[11px]"
                  >
                    Add media
                  </button>
                )}
              </div>
            </div>

            {theater && (
              <div className="lg:hidden">
                <SidePanel
                  room={room}
                  currentUser={currentUser}
                  isAdmin={isAdmin}
                  onOpenAdd={() => setAddOpen(true)}
                  onRequestClear={() => setConfirm('clear')}
                  notify={notify}
                />
              </div>
            )}
          </div>

          {!theater && (
            <div className="lg:sticky lg:top-[88px] lg:h-[calc(100vh-104px)]">
              <SidePanel
                room={room}
                currentUser={currentUser}
                isAdmin={isAdmin}
                onOpenAdd={() => setAddOpen(true)}
                onRequestClear={() => setConfirm('clear')}
                notify={notify}
              />
            </div>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[10px] text-white/20">
          <span className="h-1 w-1 rounded-full bg-violet-400/60" />
          Server-authoritative clock · peer drift corrected continuously · audio stays on your device
        </p>
      </main>

      <AddMediaModal open={addOpen} onClose={() => setAddOpen(false)} notify={notify} />

      <ConfirmDialog
        open={confirm === 'clear'}
        title="Clear the queue?"
        description="This removes every track and stops playback for everyone in the room."
        confirmLabel="Clear queue"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          socket.emit('queue:clear', { roomCode: room.roomCode });
          notify('Queue cleared', 'The room is ready for something new.', 'info');
        }}
      />

      <ConfirmDialog
        open={confirm === 'end'}
        title="End this room?"
        description="Everyone will be disconnected and the room code will stop working immediately."
        confirmLabel="End room"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          onEndRoom();
          notify('Room ended', 'Everyone has been disconnected.', 'info');
        }}
      />
    </div>
  );
}
