import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ExternalLink,
  Loader2,
  Lock,
  Maximize,
  Maximize2,
  Minimize,
  Minimize2,
  Music2,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { RoomState, RoomUser } from '../../types.js';
import type { useMediaPlayer } from '../../hooks/useMediaPlayer.js';
import { socket } from '../../services/socket.js';
import { clockSync } from '../../services/clockSync.js';
import { cn } from '../../lib/cn.js';
import { formatTime, providerLabel } from '../../lib/format.js';
import { Waveform } from '../Waveform.js';

interface NowPlayingCardProps {
  room: RoomState;
  currentUser: RoomUser;
  isAdmin: boolean;
  player: ReturnType<typeof useMediaPlayer>;
  volume: number;
  onVolumeChange: (volume: number) => void;
  youtubeMode: 'video' | 'audio';
  onYouTubeModeChange: (mode: 'video' | 'audio') => void;
  theater: boolean;
  onToggleTheater: () => void;
  spotifyConnected: boolean;
  spotifyConfigured: boolean;
  onConnectSpotify: () => void;
  onOpenAdd: () => void;
  notify?: (title: string, description?: string, tone?: 'info' | 'success' | 'error') => void;
}

export function NowPlayingCard({
  room,
  currentUser,
  isAdmin,
  player,
  volume,
  onVolumeChange,
  youtubeMode,
  onYouTubeModeChange,
  theater,
  onToggleTheater,
  spotifyConnected,
  spotifyConfigured,
  onConnectSpotify,
  onOpenAdd,
  notify,
}: NowPlayingCardProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nudgeMs, setNudgeMs] = useState(clockSync.getNudge());
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const handleToggleFullscreen = () => {
    if (!isFullscreen) {
      if (track?.provider === 'youtube' && youtubeMode === 'audio') {
        onYouTubeModeChange('video');
      }
      setIsFullscreen(true);
      try {
        if (stageRef.current?.requestFullscreen) {
          void stageRef.current.requestFullscreen().catch(() => {});
        } else if ((stageRef.current as any)?.webkitRequestFullscreen) {
          void (stageRef.current as any).webkitRequestFullscreen();
        }
      } catch {}
    } else {
      setIsFullscreen(false);
      try {
        if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        }
      } catch {}
    }
  };

  const track = room.playback.currentTrack;
  const isPlaying = room.playback.status === 'playing';

  const emit = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      socket.emit(event, { roomCode: room.roomCode, ...payload });
    },
    [room.roomCode]
  );

  const canControl =
    isAdmin ||
    room.settings.playbackControl === 'anyone' ||
    !room.users.some((u) => u.isAdmin && u.isOnline);

  const handleMainPlay = useCallback(() => {
    if (!track) return;

    // 1. Direct synchronous activation inside user click gesture!
    // Don't await - keep play() in the same event loop tick for iOS Safari
    void player.activate();

    // 2. Control room playback if user canControl, or confirm local sync
    if (canControl) {
      if (isPlaying) {
        // Room is playing -> user wants to PAUSE
        emit('playback:pause');
      } else {
        // Room is paused -> user wants to PLAY
        emit('playback:play');
      }
    } else {
      if (!isPlaying) {
        notify?.('Paused by Host', 'Waiting for room host to start playback.', 'info');
      } else {
        notify?.('Locked in Sync', 'Your device is locked to room playback.', 'success');
      }
    }
  }, [track, canControl, isPlaying, player, notify, room.roomCode]);

  // Immediate Spacebar play/pause listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox')
      ) {
        return;
      }

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        void handleMainPlay();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleMainPlay]);

  const handleStageClick = () => {
    if (player.phase === 'needs-interaction' || (!player.isPlayingLocally && isPlaying)) {
      void player.activate();
    }
  };

  const handleForceSync = () => {
    setIsSyncing(true);
    socket.emit('playback:force_sync', { roomCode: room.roomCode });
    notify?.('Syncing devices', 'Resyncing all devices to the exact same millisecond...', 'info');
    setTimeout(() => setIsSyncing(false), 1200);
  };

  const [scrub, setScrub] = useState<number | null>(null);
  const duration = player.duration || track?.duration || 0;
  const displayTime = scrub ?? player.currentTime;
  const progress = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;
  const drift = Math.abs(player.driftMs);
  const inSync = drift < 250;

  const cycleRepeat = () => {
    const next =
      room.settings.repeatMode === 'off'
        ? 'all'
        : room.settings.repeatMode === 'all'
          ? 'one'
          : 'off';
    emit('settings:update', { settings: { repeatMode: next } });
  };

  const providerIcon =
    track?.provider === 'youtube' ? Video : track?.provider === 'spotify' ? Music2 : Radio;

  const ProviderIcon = providerIcon;

  return (
    <section className="relative overflow-hidden rounded-[32px] p-4 sm:p-6 bg-white/[0.035] backdrop-blur-3xl border border-white/[0.1] shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.15)]">
      {/* ------------------------------------------------------------ header -- */}
      <div className="relative mb-3.5 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          {track && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-medium text-[#fde5b7]">
              <ProviderIcon className="h-3.5 w-3.5 text-[#40E0D0]" />
              {providerLabel(track.provider)}
            </span>
          )}

          {/* Video / Audio toggle moved OUTSIDE the video playback stage */}
          {track?.provider === 'youtube' && (
            <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-0.5 backdrop-blur-md">
              <button
                type="button"
                onClick={() => onYouTubeModeChange('video')}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer',
                  youtubeMode === 'video'
                    ? 'bg-[#40E0D0]/20 text-[#40E0D0] font-semibold border border-[#40E0D0]/30 shadow-[0_0_10px_rgba(64,224,208,0.2)]'
                    : 'text-[#a8a29e] hover:text-white'
                )}
              >
                <Video className="h-3 w-3" />
                Video
              </button>
              <button
                type="button"
                onClick={() => onYouTubeModeChange('audio')}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer',
                  youtubeMode === 'audio'
                    ? 'bg-[#40E0D0]/20 text-[#40E0D0] font-semibold border border-[#40E0D0]/30 shadow-[0_0_10px_rgba(64,224,208,0.2)]'
                    : 'text-[#a8a29e] hover:text-white'
                )}
              >
                <Radio className="h-3 w-3" />
                Audio
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {track && (
            <button
              type="button"
              onClick={handleForceSync}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#40E0D0]/15 hover:bg-[#40E0D0]/25 text-[#40E0D0] border border-[#40E0D0]/30 text-[11px] font-semibold transition-all shadow-[0_0_12px_rgba(64,224,208,0.2)] active:scale-95 cursor-pointer"
              title="Force synchronize all connected devices to the exact same millisecond"
            >
              <RotateCcw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
              <span>{isSyncing ? 'Syncing...' : 'Sync All Devices'}</span>
            </button>
          )}

          {track && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium backdrop-blur-md',
                inSync ? 'border-[#40E0D0]/30 text-[#40E0D0] bg-[#40E0D0]/10' : 'border-red-400/30 text-red-400 bg-red-400/10'
              )}
            >
              <span
                className={cn('h-1.5 w-1.5 rounded-full', inSync ? 'bg-[#40E0D0]' : 'bg-red-400')}
              />
              {isPlaying ? (inSync ? 'Locked in sync' : `${drift}ms drift`) : 'Paused'}
            </span>
          )}

          {track && (room.settings.automix ?? true) && (
            <span
              className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono text-[#fde5b7]/90"
              title={`DJ Crossfade active (${room.settings.crossfade ?? 4}s)`}
            >
              <Sparkles className="h-2.5 w-2.5 text-[#40E0D0]" />
              <span>Automix {room.settings.crossfade ?? 4}s</span>
            </span>
          )}

          {/* Full screen option for phones and desktops */}
          {track && (
            <button
              type="button"
              onClick={handleToggleFullscreen}
              className="h-8 px-2.5 items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.05] text-[#fde5b7] hover:text-white hover:border-white/25 active:scale-95 transition-all inline-flex cursor-pointer text-xs font-medium shadow-sm"
              title={isFullscreen ? 'Exit full screen' : 'Full screen mode'}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5 text-[#40E0D0]" />}
              <span>{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleTheater}
            className="hidden h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-[#a8a29e] hover:text-white hover:border-white/20 transition-all sm:inline-flex"
            title={theater ? 'Exit theater mode' : 'Theater mode'}
            aria-label={theater ? 'Exit theater mode' : 'Theater mode'}
          >
            {theater ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- stage -- */}
      <div
        ref={stageRef}
        onClick={handleStageClick}
        className={cn(
          'group relative overflow-hidden bg-ink ring-1 ring-sand transition-all',
          isFullscreen
            ? 'fixed inset-0 z-[99999] w-screen h-[100dvh] rounded-none ring-0 flex items-center justify-center bg-black overflow-hidden'
            : cn(
                'rounded-[16px]',
                theater ? 'aspect-[16/8] sm:aspect-[16/7]' : 'aspect-[16/10] sm:aspect-[16/9]'
              )
        )}
      >
        {isFullscreen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleFullscreen();
            }}
            className="absolute top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-black/80 hover:bg-black active:scale-95 text-white border border-white/25 backdrop-blur-md text-xs font-semibold shadow-2xl transition-all cursor-pointer"
          >
            <Minimize className="h-4 w-4 text-[#40E0D0]" />
            <span>Exit Full Screen</span>
          </button>
        )}

        {/* Floating 1-tap Fullscreen button directly on the stage for mobile phones */}
        {!isFullscreen && track && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleFullscreen();
            }}
            className="absolute top-3 right-3 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/85 active:scale-95 text-white backdrop-blur-md border border-white/20 text-[11px] font-semibold transition-all cursor-pointer shadow-lg sm:hidden"
            title="Full screen"
            aria-label="Full screen"
          >
            <Maximize className="h-3 w-3 text-[#40E0D0]" />
            <span>Full Screen</span>
          </button>
        )}

        {track ? (
          <>
            <img
              src={track.thumbnail}
              alt=""
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-ink/35 to-ink/85" />

            {track.provider === 'youtube' && (
              <div
                ref={player.youtubeHostRef}
                className={cn(
                  'absolute inset-0 h-full w-full pointer-events-none overflow-hidden scale-[1.04]',
                  youtubeMode === 'audio' && !isFullscreen ? 'opacity-[0.01]' : 'opacity-100'
                )}
              />
            )}

            {track.provider === 'youtube' && (youtubeMode === 'video' || isFullscreen) ? (
              <div className="absolute inset-0 z-10 pointer-events-none" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative h-[62%] w-auto max-w-[62%]">
                  <img
                    src={track.thumbnail}
                    alt={`${track.title} cover`}
                    className={cn(
                      'relative h-full w-auto max-w-full rounded-xl object-cover shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)] ring-1 ring-cream/15',
                      track.provider === 'spotify' && 'rounded-full'
                    )}
                  />
                  {track.provider === 'spotify' && (
                    <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-cream/15">
                      <div className="absolute inset-[18%] rounded-full border border-cream/15" />
                      <div className="absolute inset-[38%] grid place-items-center rounded-full bg-ink/50 backdrop-blur-sm">
                        <Music2 className="h-5 w-5 text-cream" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* corner meta */}
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent p-3 sm:p-4 transition-opacity',
                isFullscreen && 'opacity-0 group-hover:opacity-100'
              )}
            >
              <div className="min-w-0">
                <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-cream/50">
                  {isPlaying ? 'Playing live' : 'Standing by'}
                </p>
                <p className="mt-0.5 line-clamp-1 text-xs font-medium text-cream/85 sm:text-sm">
                  {track.title}
                </p>
              </div>
              <div className="hidden w-32 sm:block">
                <Waveform
                  playing={isPlaying}
                  bars={28}
                  className="h-7"
                  barClassName="bg-gradient-to-t from-cream/35 to-cream"
                />
              </div>
            </div>



            {/* player overlays */}
            {player.phase === 'loading' && (
              <div className="absolute inset-0 z-30 grid place-items-center bg-ink/70 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2 text-xs text-cream/70">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Preparing the player…
                </div>
              </div>
            )}

            {player.phase === 'needs-interaction' && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  void player.activate();
                }}
                className="absolute inset-x-3 top-3 z-30 flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#fde5b7] text-black shadow-2xl cursor-pointer hover:bg-[#fee8c8] active:scale-95 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl bg-black/10 grid place-items-center shrink-0">
                    <Volume2 className="h-4 w-4 text-black animate-pulse" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold leading-tight">Tap anywhere to hear audio</p>
                    <p className="text-[10px] text-black/75 leading-tight">In sync with room · BeatSync active</p>
                  </div>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-black text-[#fde5b7] text-xs font-bold shrink-0">
                  Play Now
                </span>
              </div>
            )}

            {player.phase === 'needs-spotify' && (
              <div className="absolute inset-0 z-30 grid place-items-center bg-ink/80 p-6 backdrop-blur-md">
                <div className="max-w-sm text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-cream/15 bg-cream/10">
                    <Music2 className="h-5 w-5 text-cream" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-cream">Spotify needs your account</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-cream/55">
                    Spotify does not stream through the room server. Each listener connects their own
                    Premium account — playback is still kept on the same beat.
                  </p>
                  {spotifyConfigured ? (
                    <button
                      type="button"
                      onClick={onConnectSpotify}
                      className="btn btn-primary mt-4 h-9 border-cream/20 bg-cream px-4 text-xs text-ink hover:bg-linen"
                    >
                      Connect Spotify Premium
                    </button>
                  ) : (
                    <p className="mt-3 rounded-lg border border-cream/15 bg-cream/10 px-3 py-2 text-[10px] text-cream/70">
                      Spotify is not configured on this deployment. Ask the host to add
                      VITE_SPOTIFY_CLIENT_ID.
                    </p>
                  )}
                  <a
                    href={track.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-[10px] font-medium text-cream/60 hover:text-cream"
                  >
                    Open in Spotify
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}

            {player.phase === 'error' && (
              <div className="absolute inset-0 z-30 grid place-items-center bg-ink/85 p-6 backdrop-blur-md">
                <div className="max-w-sm text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-rust/30 bg-rust/15">
                    <Music2 className="h-5 w-5 text-rust" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-cream">This one cannot play here</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-cream/55">{player.error}</p>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <a
                      href={track.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn h-9 border-cream/20 bg-transparent px-3 text-xs text-cream hover:bg-cream/10"
                    >
                      Open externally
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => emit('playback:next')}
                        className="btn btn-primary h-9 border-cream/20 bg-cream px-3 text-xs text-ink hover:bg-linen"
                      >
                        Skip track
                        <SkipForward className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,rgba(191,180,161,0.14),transparent_65%)] p-6 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl border border-cream/10 bg-cream/[0.04]">
              <Music2 className="h-7 w-7 text-cream/40" />
            </div>
            <div>
              <p className="font-display text-lg font-semibold text-cream">The room is quiet</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-cream/50">
                {isAdmin
                  ? 'Add a YouTube, Spotify, or audio link and everyone will hear it together.'
                  : 'Waiting for the admin to queue the first track.'}
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={onOpenAdd}
                className="btn btn-primary mt-1 h-9 border-cream/20 bg-cream px-4 text-xs text-ink hover:bg-linen font-semibold flex items-center gap-2"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Search Library & Add Track</span>
              </button>
            )}
          </div>
        )}
      </div>

      <audio ref={player.audioRef} preload="auto" className="hidden" />

      {/* ------------------------------------------------------------- track -- */}
      <div className="mt-4 flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <h2 className="font-display line-clamp-1 text-xl font-bold tracking-tight text-white sm:text-2xl">
            {track?.title || 'Nothing playing yet'}
          </h2>
          <p className="mt-1 line-clamp-1 text-[12.5px] text-taupe">
            {track ? (
              <>
                {track.artist}
                {track.album ? <span className="text-clay"> · {track.album}</span> : null}
              </>
            ) : (
              'Queue a track to light up the room'
            )}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-1.5">
          {track && (
            <span className="chip py-1 text-[10px]">
              <ProviderIcon className="h-3 w-3" />
              {providerLabel(track.provider)}
            </span>
          )}
          {track && (
            <span className="text-[10px] text-taupe">
              queued by <span className="text-graphite">{track.addedBy}</span>
            </span>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------- seek -- */}
      <div className="mt-3 px-1">
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.1}
          value={Math.min(displayTime, Math.max(duration, 0.1))}
          disabled={!track || duration <= 0 || !canControl}
          onChange={(event) => {
            if (!canControl) return;
            setScrub(Number(event.target.value));
          }}
          onPointerUp={() => {
            if (scrub !== null && canControl) {
              emit('playback:seek', { position: scrub });
              setScrub(null);
            }
          }}
          onKeyUp={() => {
            if (scrub !== null && canControl) {
              emit('playback:seek', { position: scrub });
              setScrub(null);
            }
          }}
          className="slider"
          style={{ ['--slider-progress' as string]: `${progress}%` }}
          aria-label="Seek"
        />
        <div className="mt-1 flex items-center justify-between font-mono text-[10.5px] text-taupe">
          <span>{formatTime(displayTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>

      {/* ----------------------------------------------------------- controls -- */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => emit('settings:update', { settings: { isShuffle: !room.settings.isShuffle } })}
            disabled={!canControl}
            className={cn(
              'icon-btn relative',
              room.settings.isShuffle && 'bg-white/10 text-[#fde5b7]'
            )}
            title={canControl ? 'Shuffle' : 'Playback control is host-only'}
            aria-label="Toggle shuffle"
          >
            <Shuffle className="h-4 w-4" />
            {room.settings.isShuffle && (
              <span className="absolute bottom-1 h-0.5 w-2 rounded-full bg-ink" />
            )}
          </button>
          <button
            type="button"
            onClick={() => emit('playback:seek', { position: Math.max(0, displayTime - 15) })}
            disabled={!canControl || !track}
            className="icon-btn"
            title={canControl ? 'Seek back 15s' : 'Playback control is host-only'}
            aria-label="Seek back 15s"
          >
            <span className="text-xs font-bold">-15s</span>
          </button>
          <button
            type="button"
            onClick={() => emit('playback:prev')}
            disabled={!canControl || !track}
            className="icon-btn"
            title={canControl ? 'Previous track' : 'Playback control is host-only'}
            aria-label="Previous track"
          >
            <SkipBack className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleMainPlay}
          disabled={!track}
          className={cn(
            'grid h-14 w-14 place-items-center rounded-full bg-[#fde5b7] text-black transition-all shadow-lg',
            'hover:bg-[#fee8c8] hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 cursor-pointer',
            (!player.isPlayingLocally && isPlaying) && 'ring-4 ring-[#40E0D0]/50 animate-pulse'
          )}
          title={
            canControl
              ? isPlaying
                ? 'Pause playback'
                : 'Play playback'
              : isPlaying
              ? (player.isPlayingLocally ? 'In sync with host' : 'Tap to start synchronized audio')
              : 'Host paused playback'
          }
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying && (canControl || player.isPlayingLocally) ? (
            <Pause className="h-6 w-6 fill-black text-black" />
          ) : (
            <Play className="ml-0.5 h-6 w-6 fill-black text-black" />
          )}
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => emit('playback:seek', { position: Math.min(duration, displayTime + 15) })}
            disabled={!canControl || !track}
            className="icon-btn"
            title={canControl ? 'Seek forward 15s' : 'Playback control is host-only'}
            aria-label="Seek forward 15s"
          >
            <span className="text-xs font-bold">+15s</span>
          </button>
          <button
            type="button"
            onClick={() => emit('playback:next')}
            disabled={!canControl || !track}
            className="icon-btn"
            title={canControl ? 'Next track' : 'Playback control is host-only'}
            aria-label="Next track"
          >
            <SkipForward className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={cycleRepeat}
            disabled={!canControl}
            className={cn(
              'icon-btn relative',
              room.settings.repeatMode !== 'off' && 'bg-white/10 text-[#fde5b7]'
            )}
            title={`Repeat: ${room.settings.repeatMode}`}
            aria-label="Cycle repeat mode"
          >
            {room.settings.repeatMode === 'one' ? (
              <Repeat1 className="h-4 w-4" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- utils -- */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sand bg-paper px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onVolumeChange(volume === 0 ? 0.75 : 0)}
              className="icon-btn h-8 w-8"
              aria-label={volume === 0 ? 'Unmute' : 'Mute'}
            >
              {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => onVolumeChange(Number(event.target.value))}
              className="slider w-20 sm:w-28"
              style={{ ['--slider-progress' as string]: `${Math.round(volume * 100)}%` }}
              aria-label="Local volume"
            />
            <span className="hidden font-mono text-[10px] text-taupe sm:inline">
              {Math.round(volume * 100)}%
            </span>
          </div>

          {/* Latency Nudge Offset (BeatSync control for bluetooth headphone lag) */}
          <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-xs">
            <button
              type="button"
              onClick={() => setNudgeMs(clockSync.nudge(-10))}
              className="px-1 font-mono text-xs text-[#a8a29e] transition-colors hover:text-[#40E0D0] cursor-pointer"
              title="Nudge audio -10ms (earlier)"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => {
                clockSync.resetNudge();
                setNudgeMs(0);
              }}
              className="px-1 font-mono text-[11px] text-[#fde5b7] hover:underline cursor-pointer"
              title="Manual latency offset. Click to reset to +0ms"
            >
              {nudgeMs >= 0 ? `+${nudgeMs}ms` : `${nudgeMs}ms`}
            </button>
            <button
              type="button"
              onClick={() => setNudgeMs(clockSync.nudge(10))}
              className="px-1 font-mono text-xs text-[#a8a29e] transition-colors hover:text-[#40E0D0] cursor-pointer"
              title="Nudge audio +10ms (later)"
            >
              »
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {track?.provider === 'spotify' && spotifyConnected && (
            <span className="chip border-forest/25 py-1 text-[10px] text-forest">
              <span className="h-1.5 w-1.5 rounded-full bg-forest" />
              Spotify connected
            </span>
          )}
          {track && !isAdmin && (
            <span className="chip py-1 text-[10px]">
              <Lock className="h-3 w-3" />
              Admin controls
            </span>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdd}
              className="btn btn-ghost h-8 rounded-lg px-2.5 text-[11px]"
            >
              <Sparkles className="h-3 w-3" />
              Add
            </button>
          )}
          <span className="hidden items-center gap-1 font-mono text-[10px] text-taupe sm:flex">
            <RotateCcw className="h-3 w-3" />
            {player.isReady ? `${Math.abs(player.driftMs)}ms` : 'syncing'}
          </span>
        </div>
      </div>

      {!isAdmin && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] text-taupe">
          <Lock className="h-3 w-3" />
          {currentUser.username}, you are listening. The admin controls playback.
        </p>
      )}
    </section>
  );
}
