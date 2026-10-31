import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem, PlaybackState } from '../types.js';
import { clockSync } from '../services/clockSync.js';
import { getApiUrl, socket } from '../services/socket.js';
import { spotifyDevice } from '../services/spotify.js';
import {
  HowlerAudioAdapter,
  SpotifyAdapter,
  YouTubeAdapter,
  createYouTubeAdapter,
  type PlayerAdapter,
} from '../services/players.js';
import { positionAt, waitUntilStart } from '../lib/playback.js';
import { audioUnlocker } from '../services/audioUnlocker.js';

type PlayerPhase = 'idle' | 'loading' | 'ready' | 'needs-interaction' | 'needs-spotify' | 'error';

interface UseMediaPlayerOptions {
  track: MediaItem | null;
  playback: PlaybackState;
  roomCode: string;
  volume: number;
  spotifyConnected: boolean;
  spotifyVersion: number;
  crossfade?: number;
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
  crossfade = 4,
}: UseMediaPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubeHostRef = useRef<HTMLDivElement | null>(null);

  const adapterRef = useRef<PlayerAdapter | null>(null);
  const outgoingAdapterRef = useRef<PlayerAdapter | null>(null);
  const outgoingFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const lastSeekTime = useRef(0);
  const previousStatus = useRef<string | null>(null);
  const previousTrackId = useRef<string | null>(null);
  const smoothedDrift = useRef(0);

  // Auto-resume playback seamlessly as soon as user touches the screen
  useEffect(() => {
    return audioUnlocker.onUnlock(() => {
      if (playbackRef.current.status === 'playing') {
        const adapter = adapterRef.current;
        if (adapter && (!adapter.isPlaying || !adapter.isPlaying())) {
          void Promise.resolve(adapter.play()).catch(() => {});
          setPhase('ready');
        }
      }
    });
  }, []);

  // Tear down / build an adapter whenever the track changes (with DJ crossfade).
  useEffect(() => {
    if (startTimer.current) clearTimeout(startTimer.current);
    startTimer.current = null;
    endedForTrack.current = null;
    reportedDuration.current = null;
    notPlayingTicks.current = 0;
    smoothedDrift.current = 0;
    setCurrentTime(0);
    setMeasuredDuration(0);
    setDriftMs(0);

    const previous = adapterRef.current;
    adapterRef.current = null;
    const fadeDurationSec = crossfade ?? 4;
    const isPreviousPlaying = Boolean(previous && previous.isPlaying && previous.isPlaying());

    // DJ Automix / Crossfade: smooth fade out of outgoing track
    if (previous) {
      if (isPreviousPlaying && fadeDurationSec > 0 && previous.fade) {
        if (outgoingFadeTimer.current) clearTimeout(outgoingFadeTimer.current);
        if (outgoingAdapterRef.current) {
          try { outgoingAdapterRef.current.destroy(); } catch {}
        }
        outgoingAdapterRef.current = previous;
        const fadeMs = Math.min(fadeDurationSec * 1000, 2500);
        try {
          previous.fade(volume, 0, fadeMs);
        } catch {}
        outgoingFadeTimer.current = setTimeout(() => {
          try {
            outgoingAdapterRef.current?.destroy();
          } catch {}
          outgoingAdapterRef.current = null;
          outgoingFadeTimer.current = null;
        }, fadeMs + 50);
      } else {
        try {
          previous.destroy();
        } catch {}
      }
    }
    setAdapterTick(0);

    if (!track) {
      setPhase('idle');
      setError(null);
      return;
    }

    setError(null);
    setPhase('loading');
    let cancelled = false;
    const initialNow = clockSync.getServerNow();
    const initialTarget = positionAt(playbackRef.current, initialNow);
    const initialVolume = (isPreviousPlaying && fadeDurationSec > 0) ? 0 : volume;

    const applyPlaybackOnReady = (adapter: PlayerAdapter, initialSeek: number) => {
      if (cancelled) return;
      setPhase('ready');
      setAdapterTick((tick) => tick + 1);
      if (isPreviousPlaying && fadeDurationSec > 0 && adapter.fade) {
        adapter.fade(0, volume, Math.min(fadeDurationSec * 1000, 2500));
      }
      // Immediately apply current authoritative playback state
      const now = clockSync.getServerNow();
      const target = positionAt(playbackRef.current, now);
      const wait = waitUntilStart(playbackRef.current, now);
      const isPlaying = playbackRef.current.status === 'playing';
      if (initialSeek > 0 || target > 0) {
        adapter.seek(target > 0 ? target : initialSeek);
      }
      if (isPlaying) {
        adapter.setRate(1);
        if (wait > 40) {
          adapter.pause();
          startTimer.current = setTimeout(() => {
            adapterRef.current?.setRate(1);
            void Promise.resolve(adapterRef.current?.play()).catch(() => {
              if (!audioUnlocker.isUnlocked()) setPhase('needs-interaction');
            });
          }, wait);
        } else {
          void Promise.resolve(adapter.play()).catch(() => {
            if (!audioUnlocker.isUnlocked()) setPhase('needs-interaction');
          });
        }
      }
    };

    if (track.provider === 'audio') {
      const src = audioSource(track);
      const adapter = new HowlerAudioAdapter(
        src,
        initialVolume,
        () => applyPlaybackOnReady(adapter, initialTarget),
        () => {
          if (endedForTrack.current !== track.id) {
            endedForTrack.current = track.id;
            socket.emit('track:ended', { roomCode, trackId: track.id });
            socket.emit('playback:track_ended', { roomCode, trackId: track.id });
          }
        },
        (err) => {
          if (cancelled) return;
          setError(err);
          setPhase('error');
        }
      );
      adapterRef.current = adapter;
      if (adapter.isReady()) applyPlaybackOnReady(adapter, initialTarget);
      setAdapterTick((tick) => tick + 1);
    }

    if (track.provider === 'youtube') {
      const host = youtubeHostRef.current;
      if (!host) return;

      createYouTubeAdapter(
        host,
        track.mediaId,
        initialTarget,
        () => {
          applyPlaybackOnReady(adapterRef.current!, initialTarget);
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
          applyPlaybackOnReady(adapter, initialTarget);
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
          applyPlaybackOnReady(adapter, initialTarget);
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

      const statusChanged = previousStatus.current !== playback.status;
      const trackChanged = previousTrackId.current !== playback.currentTrack?.id;
      previousStatus.current = playback.status;
      previousTrackId.current = playback.currentTrack?.id;

      try {
        if (activeAdapter instanceof SpotifyAdapter && activeAdapter.prime) {
          await activeAdapter.prime(target, playback.status === 'playing');
        }

        if (playback.status === 'playing') {
          const isAlreadyPlaying = activeAdapter.isPlaying ? activeAdapter.isPlaying() : false;
          const currentPos = activeAdapter.getTime();
          const discrepancy = Math.abs(currentPos - target);

          // 1. Initial play, track switch, or device joining mid-playback:
          if (!isAlreadyPlaying || trackChanged) {
            activeAdapter.seek(target);
            lastSeekTime.current = Date.now();
            setCurrentTime(target);

            if (wait > 40) {
              activeAdapter.pause();
              startTimer.current = setTimeout(() => {
                adapterRef.current?.setRate(1);
                void Promise.resolve(adapterRef.current?.play()).catch(() => {
                  if (!audioUnlocker.isUnlocked()) {
                    setPhase('needs-interaction');
                  }
                });
              }, wait);
            } else {
              activeAdapter.setRate(1);
              void Promise.resolve(activeAdapter.play()).catch(() => {
                if (!audioUnlocker.isUnlocked()) {
                  setPhase('needs-interaction');
                }
              });
            }
            setPhase('ready');
            return;
          }

          // 2. Authoritative update received while already playing (e.g. seek, or resume from pause):
          // Never hard seek while already playing unless huge desync (> 1.2s)
          if (statusChanged || (discrepancy > 1.2 && Date.now() - lastSeekTime.current > 3000)) {
            activeAdapter.seek(target);
            lastSeekTime.current = Date.now();
            activeAdapter.setRate(1);
            setCurrentTime(target);
          }
        } else {
          // Status is paused or stopped
          activeAdapter.pause();
          if (Math.abs(activeAdapter.getTime() - target) > 0.1) {
            activeAdapter.seek(target);
            lastSeekTime.current = Date.now();
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

  // Instant broadcast sync: snaps all devices across the room at the exact same millisecond
  useEffect(() => {
    const onInstantSync = (payload: { position: number; serverTimestamp: number }) => {
      const activeAdapter = adapterRef.current;
      if (!activeAdapter || !activeAdapter.isReady()) return;

      const serverNow = clockSync.getServerNow();
      const elapsed = Math.max(0, serverNow - payload.serverTimestamp) / 1000;
      const target = Math.max(0, payload.position + elapsed);

      lastSeekTime.current = Date.now();
      activeAdapter.seek(target);
      activeAdapter.setRate(1);
      setCurrentTime(target);

      if (playbackRef.current.status === 'playing') {
        const isPlaying = activeAdapter.isPlaying ? activeAdapter.isPlaying() : false;
        if (!isPlaying) {
          void Promise.resolve(activeAdapter.play()).catch(() => {});
        }
      }
    };

    socket.on('playback:instant_sync', onInstantSync);
    return () => {
      socket.off('playback:instant_sync', onInstantSync);
    };
  }, []);

  // Continuous micro-drift detection + instant alignment (BeatSync engine)
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
        const rawDrift = position - target;

        // Exponential smoothing filter:
        // Dampens OS audio clock buffer fluctuations (~20-50ms) to eliminate rate oscillation/flutter.
        smoothedDrift.current = 0.7 * smoothedDrift.current + 0.3 * rawDrift;
        const drift = Math.abs(rawDrift) > 0.8 ? rawDrift : smoothedDrift.current;
        const driftMillis = Math.round(drift * 1000);
        setCurrentTime(position);
        setDriftMs(driftMillis);

        const duration = track.duration || (active.currentTrack?.duration ?? 0);
        const fadeSec = crossfade ?? 4;
        const triggerThreshold = fadeSec > 0 ? Math.max(1, fadeSec) : 0.4;

        if (duration > 0 && (position >= duration - triggerThreshold || target >= duration - triggerThreshold)) {
          if (endedForTrack.current !== track.id) {
            endedForTrack.current = track.id;
            if (fadeSec > 0 && adapter.fade) {
              try {
                adapter.fade(volume, 0, fadeSec * 1000);
              } catch {}
            }
            socket.emit('track:ended', { roomCode, trackId: track.id });
            socket.emit('playback:track_ended', { roomCode, trackId: track.id });
          }
          return;
        }

        const absDrift = Math.abs(drift);
        const isYouTube = adapter instanceof YouTubeAdapter;
        const timeSinceLastSeek = Date.now() - lastSeekTime.current;

        if (isYouTube) {
          // YouTube: Only hard seek on massive desync (> 1.5s) to prevent video buffer freezing
          if (absDrift > 1.5 && timeSinceLastSeek > 4000) {
            adapter.seek(target);
            lastSeekTime.current = Date.now();
            adapter.setRate(1);
          } else if (absDrift > 0.12) {
            // Gentle 3% rate correction for smooth catch-up without frame drops
            adapter.setRate(drift < 0 ? 1.03 : 0.97);
          } else {
            adapter.setRate(1);
          }
        } else {
          // Howler Audio / HTML5 Audio:
          // Never hard seek unless drift > 1.2s and sustained (prevents audio hitching/stuttering)
          if (absDrift > 1.2 && timeSinceLastSeek > 3000) {
            adapter.seek(target);
            lastSeekTime.current = Date.now();
            adapter.setRate(1);
          } else if (absDrift > 0.25) {
            // Moderate drift (250ms - 1.2s): 3% catch-up rate (smooth, natural, pitch-preserved)
            adapter.setRate(drift < 0 ? 1.03 : 0.97);
          } else if (absDrift > 0.075) {
            // Micro drift (75ms - 250ms): 1.5% micro-trim (virtually imperceptible)
            adapter.setRate(drift < 0 ? 1.015 : 0.985);
          } else {
            // Within 75ms: perfect sweet spot, locked at 1.0x with zero rate modulation
            adapter.setRate(1);
          }
        }

        // Keep mobile lockscreen position state up-to-date
        if (
          Math.random() < 0.15 &&
          typeof navigator !== 'undefined' &&
          'mediaSession' in navigator &&
          'setPositionState' in navigator.mediaSession &&
          duration > 0
        ) {
          try {
            navigator.mediaSession.setPositionState({
              duration: Math.max(0, duration),
              playbackRate: 1,
              position: Math.min(Math.max(0, position), duration),
            });
          } catch {}
        }

        if (adapter.isPlaying && !adapter.isPlaying()) {
          notPlayingTicks.current += 1;
          // Wait at least 6s (24 ticks) for mobile buffering, and only prompt if never interacted
          if (notPlayingTicks.current >= 24 && !audioUnlocker.isUnlocked()) {
            setPhase('needs-interaction');
            try {
              void Promise.resolve(adapter.play());
            } catch {}
          }
        } else {
          notPlayingTicks.current = 0;
          if (phase === 'needs-interaction') {
            setPhase('ready');
          }
        }

        if (
          track.provider === 'youtube' &&
          adapter instanceof YouTubeAdapter &&
          reportedDuration.current !== track.id
        ) {
          const measured = Math.round(adapter.getDuration());
          if (measured > 5) {
            reportedDuration.current = track.id;
            setMeasuredDuration(measured);
            if (Math.abs(measured - (track.duration || 0)) > 2) {
              socket.emit('media:duration', {
                roomCode,
                itemId: track.id,
                duration: measured,
              });
            }
          }
        }

        if (
          track.provider === 'audio' &&
          adapter instanceof HowlerAudioAdapter &&
          reportedDuration.current !== track.id
        ) {
          const measured = Math.round(adapter.getDuration());
          if (measured > 1) {
            reportedDuration.current = track.id;
            setMeasuredDuration(measured);
            if (track.duration <= 0 || Math.abs(measured - (track.duration || 0)) > 2) {
              socket.emit('media:duration', {
                roomCode,
                itemId: track.id,
                duration: measured,
              });
            }
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
    }, 250);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [roomCode, track, phase]);

  // MediaSession API keeps audio alive on iOS & Android in background/lockscreen.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !track) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || 'Vybe',
        album: 'Vybe Live Session',
        artwork: track.thumbnail
          ? [
              { src: track.thumbnail, sizes: '96x96', type: 'image/jpeg' },
              { src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' },
              { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' },
            ]
          : [],
      });
      navigator.mediaSession.playbackState = playback.status === 'playing' ? 'playing' : 'paused';

      navigator.mediaSession.setActionHandler('play', () => {
        void activate();
        socket.emit('playback:play', { roomCode });
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        socket.emit('playback:pause', { roomCode });
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        socket.emit('playback:next', { roomCode });
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        socket.emit('playback:prev', { roomCode });
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && details.seekTime !== null) {
          socket.emit('playback:seek', { roomCode, position: details.seekTime });
        }
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skip = details.seekOffset || 10;
        const pos = adapterRef.current ? adapterRef.current.getTime() : 0;
        socket.emit('playback:seek', { roomCode, position: pos + skip });
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skip = details.seekOffset || 10;
        const pos = adapterRef.current ? adapterRef.current.getTime() : 0;
        socket.emit('playback:seek', { roomCode, position: Math.max(0, pos - skip) });
      });
    } catch {}
  }, [track, playback.status, roomCode]);

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
      const now = clockSync.getServerNow();
      const target = positionAt(playbackRef.current, now);
      if (target > 0.4) {
        adapter?.seek(target);
        lastSeekTime.current = Date.now();
      }
      // Play without await to keep it in the user gesture scope
      const playPromise = adapter?.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => {
          setPhase('ready');
          setAdapterTick((tick) => tick + 1);
        }).catch(() => {
          setPhase('needs-interaction');
        });
      } else {
        setPhase('ready');
        setAdapterTick((tick) => tick + 1);
      }
    } catch {
      setPhase('needs-interaction');
    }
  }, [track?.provider]);

  useEffect(() => {
    return () => {
      if (startTimer.current) clearTimeout(startTimer.current);
      if (outgoingFadeTimer.current) clearTimeout(outgoingFadeTimer.current);
      adapterRef.current?.destroy();
      adapterRef.current = null;
      outgoingAdapterRef.current?.destroy();
      outgoingAdapterRef.current = null;
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
    isPlayingLocally: adapterRef.current?.isPlaying ? adapterRef.current.isPlaying() : (playback.status === 'playing' && phase === 'ready'),
  };
}
