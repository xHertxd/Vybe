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
import { Footer } from '../components/Footer.js';
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
    <div className="relative flex min-h-screen flex-col">
      <AuroraBackground dense />

      {/* ------------------------------------------------------------- header -- */}
      <header className="sticky top-0 z-40 border-b border-sand/80 bg-paper/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center justify-between gap-3 px-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Brand size="sm" />
            <div className="hidden h-6 w-px bg-sand sm:block" />
            <button
              type="button"
              onClick={() => void copyCode()}
              className="group flex items-center gap-2 rounded-lg border border-sand bg-cream px-2.5 py-1.5 transition-colors hover:bg-linen"
              title="Copy room code"
            >
              <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-taupe">
                Room
              </span>
              <span className="font-mono text-[13px] font-semibold tracking-[0.16em] text-ink">
                {room.roomCode}
              </span>
              {copiedCode ? (
                <Check className="h-3 w-3 text-forest" />
              ) : (
                <Copy className="h-3 w-3 text-taupe group-hover:text-graphite" />
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
                  ? 'border-rust/25 bg-rust/5 text-rust'
                  : 'border-forest/25 bg-forest/5 text-forest'
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
                    'grid h-7 w-7 place-items-center rounded-full border-2 border-paper text-[9px] font-semibold',
                    user.isAdmin ? 'bg-ink text-cream' : 'bg-linen text-graphite'
                  )}
                  title={user.username}
                >
                  {initials(user.username)}
                </div>
              ))}
              {onlineUsers.length > 4 && (
                <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-paper bg-linen text-[9px] font-medium text-taupe">
                  +{onlineUsers.length - 4}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-sand bg-cream px-2 py-1">
              <div className="grid h-6 w-6 place-items-center rounded-full bg-linen text-[9px] font-semibold text-graphite">
                {initials(currentUser.username)}
              </div>
              <div className="hidden pr-1 sm:block">
                <p className="max-w-[100px] truncate text-[11px] font-medium leading-tight text-ink">
                  {currentUser.username}
                </p>
                <p className="flex items-center gap-0.5 text-[8.5px] leading-tight text-taupe">
                  {isAdmin ? (
                    <>
                      <Crown className="h-2.5 w-2.5" />
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
                className="icon-btn h-8 w-8 hover:bg-rust/10 hover:text-rust"
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
          <div className="border-t border-rust/15 bg-rust/5 px-4 py-1.5 text-center text-[10.5px] text-rust">
            Connection lost — reconnecting. Your seat is held and playback will re-align
            automatically.
          </div>
        )}
      </header>

      {/* --------------------------------------------------------------- main -- */}
      <main className="mx-auto w-full max-w-[1480px] flex-1 px-3 pb-6 pt-4 sm:px-5 sm:pt-5 lg:px-8">
        <div
          className={cn(
            'grid items-start gap-4 lg:gap-5',
            !theater && 'lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]'
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
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-linen">
                  <ShieldCheck className="h-4 w-4 text-graphite" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-graphite">
                    {isAdmin
                      ? 'You are running this room'
                      : `${adminUser?.username || 'The admin'} is running this room`}
                  </p>
                  <p className="text-[10px] text-taupe">
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
                        spotifyConnected ? 'bg-forest' : 'bg-clay'
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

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[10px] text-taupe">
          <span className="h-1 w-1 rounded-full bg-clay" />
          Server-authoritative clock · drift corrected continuously · audio stays on your device
        </p>
      </main>

      <Footer compact />

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
