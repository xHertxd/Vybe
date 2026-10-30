import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem, PlaybackState } from '../types.js';
import { clockSync } from '../services/clockSync.js';
import { getApiUrl, socket } from '../services/socket.js';
import { spotifyDevice } from '../services/spotify.js';
import {
  AudioAdapter,
  SpotifyAdapter,
  YouTubeAdapter,
  createYouTubeAdapter,
  type PlayerAdapter,
} from '../services/players.js';
import { positionAt, waitUntilStart } from '../lib/playback.js';

type PlayerPhase = 'idle' | 'loading' | 'ready' | 'needs-interaction' | 'needs-spotify' | 'error';

interface UseMediaPlayerOptions {
  track: MediaItem | null;
  playback: PlaybackState;
  roomCode: string;
  volume: number;
  spotifyConnected: boolean;
  spotifyVersion: number;
}

function audioSource(track: MediaItem): string {
  if (track.url.startsWith('/')) return getApiUrl(track.url);
  return track.url;
}

function spotifyUri(track: MediaItem): string {
  return `spotify:track:${track.mediaId}`;
}

export function useMediaPlayer({
  track,
  playback,
  roomCode,
  volume,
  spotifyConnected,
  spotifyVersion,
}: UseMediaPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubeHostRef = useRef<HTMLDivElement | null>(null);

  const adapterRef = useRef<PlayerAdapter | null>(null);
  const [adapterTick, setAdapterTick] = useState(0);
  const [phase, setPhase] = useState<PlayerPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [measuredDuration, setMeasuredDuration] = useState(0);
  const [driftMs, setDriftMs] = useState(0);

  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedForTrack = useRef<string | null>(null);
  const reportedDuration = useRef<string | null>(null);
  const notPlayingTicks = useRef(0);

  // Tear down / build an adapter whenever the track changes.
  useEffect(() => {
    if (startTimer.current) clearTimeout(startTimer.current);
    startTimer.current = null;
    endedForTrack.current = null;
    reportedDuration.current = null;
    notPlayingTicks.current = 0;
    setCurrentTime(0);
    setMeasuredDuration(0);
    setDriftMs(0);

    const previous = adapterRef.current;
    adapterRef.current = null;
    previous?.destroy();
    setAdapterTick(0);

    if (!track) {
      setPhase('idle');
      setError(null);
      return;
    }

    setError(null);
    setPhase('loading');
    let cancelled = false;

    if (track.provider === 'audio') {
      const element = audioRef.current;
      if (!element) return;
      element.src = audioSource(track);
      element.load();
      const adapter = new AudioAdapter(
        element,
        () => {
          setPhase('ready');
          setAdapterTick((tick) => tick + 1);
        },
        () => {
          if (endedForTrack.current !== track.id) {
            endedForTrack.current = track.id;
            socket.emit('track:ended', { roomCode, trackId: track.id });
            socket.emit('playback:track_ended', { roomCode, trackId: track.id });
          }
        }
      );
      adapter.setVolume(volume);
      adapterRef.current = adapter;
      if (adapter.isReady()) setPhase('ready');
      setAdapterTick((tick) => tick + 1);
    }

    if (track.provider === 'youtube') {
      const host = youtubeHostRef.current;
      if (!host) return;

      createYouTubeAdapter(
        host,
        track.mediaId,
        () => {
          setPhase('ready');
          setAdapterTick((tick) => tick + 1);
        },
        () => {
          if (endedForTrack.current !== track.id) {
            endedForTrack.current = track.id;
            socket.emit('track:ended', { roomCode, trackId: track.id });
            socket.emit('playback:track_ended', { roomCode, trackId: track.id });
          }
        }
      )
        .then((adapter) => {
          if (cancelled) {
            adapter.destroy();
            return;
          }
          adapter.setVolume(volume);
          adapterRef.current = adapter;
          setPhase('ready');
          setAdapterTick((tick) => tick + 1);
        })
        .catch((reason: unknown) => {
          if (cancelled) return;
          setError(reason instanceof Error ? reason.message : 'This YouTube video cannot play here.');
          setPhase('error');
        });
    }

    if (track.provider === 'spotify') {
      if (!spotifyConnected) {
        setPhase('needs-spotify');
        return;
      }

      const adapter = new SpotifyAdapter(spotifyUri(track));
      adapterRef.current = adapter;
      spotifyDevice
        .initialize()
        .then(() => {
          if (cancelled) return;
          adapter.setReady(true);
          setPhase('ready');
          setAdapterTick((tick) => tick + 1);
        })
        .catch((reason: unknown) => {
          if (cancelled) return;
          setError(
            reason instanceof Error
              ? reason.message
              : 'Spotify is not ready. Reconnect your Premium account.'
          );
          setPhase('error');
        });
    }

    return () => {
      cancelled = true;
      if (startTimer.current) clearTimeout(startTimer.current);
      startTimer.current = null;
    };
    // Volume/current playback are intentionally handled in their own effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, track?.provider, spotifyConnected, spotifyVersion]);

  // Keep the local volume in sync.
  useEffect(() => {
    adapterRef.current?.setVolume(volume);
  }, [volume, adapterTick]);

  // Apply every authoritative playback change.
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || !adapter.isReady() || !track) return;
    if (startTimer.current) clearTimeout(startTimer.current);
    startTimer.current = null;

    const apply = async () => {
      const activeAdapter = adapterRef.current;
      if (!activeAdapter || !activeAdapter.isReady()) return;
      const now = clockSync.getServerNow();
      const target = positionAt(playback, now);
      const wait = waitUntilStart(playback, now);

      try {
        if (activeAdapter.prime) {
          await activeAdapter.prime(target, playback.status === 'playing');
        }

        if (playback.status === 'playing') {
          if (wait > 40) {
            activeAdapter.pause();
            activeAdapter.seek(target);
            setCurrentTime(target);
            startTimer.current = setTimeout(() => {
              adapterRef.current?.setRate(1);
              void Promise.resolve(adapterRef.current?.play()).catch(() => {
                setPhase('needs-interaction');
              });
            }, wait);
            return;
          }

          if (Math.abs(activeAdapter.getTime() - target) > 0.35) {
            activeAdapter.seek(target);
          }
          await activeAdapter.play();
          setPhase('ready');
        } else {
          activeAdapter.pause();
          if (Math.abs(activeAdapter.getTime() - target) > 0.2) {
            activeAdapter.seek(target);
          }
          setCurrentTime(target);
        }
      } catch {
        setPhase('needs-interaction');
      }
    };

    void apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.version, playback.status, playback.currentTrack?.id, adapterTick, track?.id]);

  // Drift detection + gentle correction.
  useEffect(() => {
    if (!track) return;
    let disposed = false;

    const interval = window.setInterval(() => {
      const adapter = adapterRef.current;
      const active = playbackRef.current;
      if (!adapter || !adapter.isReady() || disposed) return;

      if (active.status !== 'playing') {
        setDriftMs(0);
        setCurrentTime(adapter.getTime());
        return;
      }

      const now = clockSync.getServerNow();
      if (waitUntilStart(active, now) > 50) {
        setCurrentTime(positionAt(active, now));
        return;
      }

      const readPosition = async () => {
        if (adapter instanceof SpotifyAdapter) return adapter.refreshPosition();
        return adapter.getTime();
      };

      void readPosition().then((position) => {
        if (disposed) return;
        const target = positionAt(active, clockSync.getServerNow());
        const drift = position - target;
        const driftMillis = Math.round(drift * 1000);
        setCurrentTime(position);
        setDriftMs(driftMillis);

        const duration = track.duration || (active.currentTrack?.duration ?? 0);
        if (duration > 0 && (position >= duration - 0.4 || target >= duration - 0.4)) {
          if (endedForTrack.current !== track.id) {
            endedForTrack.current = track.id;
            socket.emit('track:ended', { roomCode, trackId: track.id });
            socket.emit('playback:track_ended', { roomCode, trackId: track.id });
          }
          return;
        }

        const absDrift = Math.abs(drift);
        const isYouTube = adapter instanceof YouTubeAdapter;

        if (isYouTube) {
          // YouTube does not support micro playback rates, snap precisely
          if (absDrift > 0.15) {
            adapter.seek(target);
            adapter.setRate(1);
          } else {
            adapter.setRate(1);
          }
        } else {
          // HTML5 Audio supports dynamic smooth rate correction without audible hitch
          if (absDrift > 0.20) {
            adapter.seek(target);
            adapter.setRate(1);
          } else if (absDrift > 0.04) {
            adapter.setRate(drift < 0 ? 1.05 : 0.95);
          } else {
            adapter.setRate(1);
          }
        }

        if (adapter.isPlaying && !adapter.isPlaying()) {
          notPlayingTicks.current += 1;
          if (notPlayingTicks.current >= 2) {
            try {
              void Promise.resolve(adapter.play()).catch(() => setPhase('needs-interaction'));
            } catch {
              setPhase('needs-interaction');
            }
          }
        } else {
          notPlayingTicks.current = 0;
        }

        if (
          track.provider === 'youtube' &&
          track.duration <= 0 &&
          adapter instanceof YouTubeAdapter &&
          reportedDuration.current !== track.id
        ) {
          const measured = adapter.getDuration();
          if (measured > 0) {
            reportedDuration.current = track.id;
            setMeasuredDuration(measured);
            socket.emit('media:duration', {
              roomCode,
              itemId: track.id,
              duration: measured,
            });
          }
        }

        if (Math.random() < 0.2) {
          const metrics = clockSync.getMetrics();
          socket.emit('playback:drift_report', {
            roomCode,
            drift: Math.abs(driftMillis),
            ping: Math.round(metrics.rtt / 2),
          });
        }
      });
    }, 350);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [roomCode, track]);

  // Surface a real duration for sources that cannot report one up front.
  useEffect(() => {
    const element = audioRef.current;
    if (!element || !track) return;

    const onMetadata = () => {
      if (Number.isFinite(element.duration) && element.duration > 0) {
        setMeasuredDuration(element.duration);
        if (track.duration <= 0 && reportedDuration.current !== track.id) {
          reportedDuration.current = track.id;
          socket.emit('media:duration', {
            roomCode,
            itemId: track.id,
            duration: element.duration,
          });
        }
      }
    };

    element.addEventListener('loadedmetadata', onMetadata);
    element.addEventListener('durationchange', onMetadata);
    return () => {
      element.removeEventListener('loadedmetadata', onMetadata);
      element.removeEventListener('durationchange', onMetadata);
    };
  }, [track, roomCode]);

  const activate = useCallback(async () => {
    const adapter = adapterRef.current;
    if (track?.provider === 'spotify') {
      try {
        await spotifyDevice.activate();
        if (adapter instanceof SpotifyAdapter) adapter.setReady(true);
        setPhase('ready');
        setAdapterTick((tick) => tick + 1);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Spotify could not start.');
        setPhase('error');
      }
      return;
    }

    try {
      await adapter?.play();
      setPhase('ready');
    } catch {
      setPhase('needs-interaction');
    }
  }, [track?.provider]);

  useEffect(() => {
    return () => {
      if (startTimer.current) clearTimeout(startTimer.current);
      adapterRef.current?.destroy();
      adapterRef.current = null;
    };
  }, []);

  const duration = track && track.duration > 0 ? track.duration : measuredDuration;

  return {
    audioRef,
    youtubeHostRef,
    phase,
    error,
    currentTime,
    duration,
    driftMs,
    activate,
    isReady: phase === 'ready',
  };
}
