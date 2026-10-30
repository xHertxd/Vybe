import { useState } from 'react';
import {
  ExternalLink,
  Loader2,
  Lock,
  Maximize2,
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
}: NowPlayingCardProps) {
  const [scrub, setScrub] = useState<number | null>(null);
  const track = room.playback.currentTrack;
  const isPlaying = room.playback.status === 'playing';
  const duration = player.duration || track?.duration || 0;
  const displayTime = scrub ?? player.currentTime;
  const progress = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;
  const drift = Math.abs(player.driftMs);
  const inSync = drift < 250;

  const emit = (event: string, payload: Record<string, unknown> = {}) => {
    socket.emit(event, { roomCode: room.roomCode, ...payload });
  };

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
    <section className="panel relative overflow-hidden rounded-[22px] p-3 sm:p-4 lg:p-5">
      {/* ------------------------------------------------------------ header -- */}
      <div className="relative mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-taupe">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                isPlaying ? 'bg-forest' : 'bg-clay'
              )}
            />
            Now playing
          </span>
          {track && (
            <span className="chip py-1 text-[10px]">
              <ProviderIcon className="h-3 w-3" />
              {providerLabel(track.provider)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {track && (
            <span
              className={cn(
                'chip py-1 text-[10px]',
                inSync ? 'border-forest/25 text-forest' : 'border-rust/25 text-rust'
              )}
            >
              <span
                className={cn('h-1.5 w-1.5 rounded-full', inSync ? 'bg-forest' : 'bg-rust')}
              />
              {isPlaying ? (inSync ? 'In sync' : `${drift}ms drift`) : 'Paused'}
            </span>
          )}
          <button
            type="button"
            onClick={onToggleTheater}
            className="icon-btn hidden h-8 w-8 sm:inline-flex"
            title={theater ? 'Exit theater mode' : 'Theater mode'}
            aria-label={theater ? 'Exit theater mode' : 'Theater mode'}
          >
            {theater ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- stage -- */}
      <div
        className={cn(
          'group relative overflow-hidden rounded-[16px] bg-ink ring-1 ring-sand',
          theater ? 'aspect-[16/8] sm:aspect-[16/7]' : 'aspect-[16/10] sm:aspect-[16/9]'
        )}
      >
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
                  'absolute inset-0 h-full w-full',
                  youtubeMode === 'audio' && 'pointer-events-none opacity-0'
                )}
              />
            )}

            {track.provider === 'youtube' && youtubeMode === 'video' ? (
              <div className="absolute inset-0 z-10" />
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
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent p-3 sm:p-4">
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

            {/* view mode toggle for YouTube */}
            {track.provider === 'youtube' && (
              <div className="absolute right-3 top-3 z-20 flex rounded-lg border border-cream/15 bg-ink/60 p-0.5 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => onYouTubeModeChange('video')}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
                    youtubeMode === 'video'
                      ? 'bg-cream/15 text-cream'
                      : 'text-cream/50 hover:text-cream'
                  )}
                >
                  <Video className="h-3 w-3" />
                  Video
                </button>
                <button
                  type="button"
                  onClick={() => onYouTubeModeChange('audio')}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
                    youtubeMode === 'audio'
                      ? 'bg-cream/15 text-cream'
                      : 'text-cream/50 hover:text-cream'
                  )}
                >
                  <Radio className="h-3 w-3" />
                  Audio
                </button>
              </div>
            )}

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
              <div className="absolute inset-0 z-30 grid place-items-center bg-ink/75 p-6 backdrop-blur-md">
                <div className="max-w-xs text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-cream/15 bg-cream/10">
                    <Volume2 className="h-5 w-5 text-cream" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-cream">Your browser is waiting</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-cream/55">
                    Tap once to allow audio for this room. Sync is already running.
                  </p>
                  <button
                    type="button"
                    onClick={() => void player.activate()}
                    className="btn btn-primary mt-4 h-9 border-cream/20 bg-cream px-4 text-xs text-ink hover:bg-linen"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Enable audio
                  </button>
                </div>
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
          <h2 className="font-display line-clamp-1 text-xl font-semibold tracking-[-0.015em] text-ink sm:text-2xl">
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
          disabled={!track || duration <= 0}
          onChange={(event) => {
            if (!isAdmin) return;
            setScrub(Number(event.target.value));
          }}
          onPointerUp={() => {
            if (scrub !== null) {
              emit('playback:seek', { position: scrub });
              setScrub(null);
            }
          }}
          onKeyUp={() => {
            if (scrub !== null) {
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
            disabled={!isAdmin}
            className={cn(
              'icon-btn relative',
              room.settings.isShuffle && 'bg-linen text-ink'
            )}
            title="Shuffle (admin)"
            aria-label="Toggle shuffle"
          >
            <Shuffle className="h-4 w-4" />
            {room.settings.isShuffle && (
              <span className="absolute bottom-1 h-0.5 w-2 rounded-full bg-ink" />
            )}
          </button>
          <button
            type="button"
            onClick={() => emit('playback:prev')}
            disabled={!isAdmin || !track}
            className="icon-btn"
            title="Previous (admin)"
            aria-label="Previous track"
          >
            <SkipBack className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => emit(isPlaying ? 'playback:pause' : 'playback:play')}
          disabled={!isAdmin || !track}
          className={cn(
            'grid h-14 w-14 place-items-center rounded-full bg-ink text-cream transition-all',
            'hover:bg-graphite disabled:opacity-40'
          )}
          title={isAdmin ? (isPlaying ? 'Pause' : 'Play') : 'Only the admin can control playback'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 fill-current" />
          ) : (
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          )}
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => emit('playback:next')}
            disabled={!isAdmin || !track}
            className="icon-btn"
            title="Next (admin)"
            aria-label="Next track"
          >
            <SkipForward className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={cycleRepeat}
            disabled={!isAdmin}
            className={cn(
              'icon-btn relative',
              room.settings.repeatMode !== 'off' && 'bg-linen text-ink'
            )}
            title={`Repeat: ${room.settings.repeatMode} (admin)`}
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
