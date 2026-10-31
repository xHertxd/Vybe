import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem, PlaybackState } from '../types.js';
import { clockSync } from '../services/clockSync.js';
import { getApiUrl, socket } from '../services/socket.js';
import { spotifyDevice } from '../services/spotify.js';
import {
  HowlerAudioAdapter,
  SpotifyAdapter,
  createYouTubeAdapter,
  type PlayerAdapter,
} from '../services/players.js';
import { positionAt, waitUntilStart } from '../lib/playback.js';
import { audioUnlocker } from '../services/audioUnlocker.js';
import { createMasterSync, type MasterSync } from '../services/masterSync.js';

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
  const masterSyncRef = useRef<MasterSync | null>(null);
  const [adapterTick, setAdapterTick] = useState(0);
  const [phase, setPhase] = useState<PlayerPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [measuredDuration, setMeasuredDuration] = useState(0);
  const [driftMs, setDriftMs] = useState(0);

  // Initialize MasterSync on mount
  useEffect(() => {
    masterSyncRef.current = createMasterSync();
    return () => {
      masterSyncRef.current?.destroy();
    };
  }, []);

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
        // Notify MasterSync of playback start for PLL phase reference
        masterSyncRef.current?.onPlayStart(target);
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
          masterSyncRef.current?.onPause();
          if (playback.status === 'stopped') {
            masterSyncRef.current?.onStop();
          }
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

      // Update MasterSync with forced position
      masterSyncRef.current?.forceSeek(target);

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

  // Continuous micro-drift detection + instant alignment (Phase-Locked Loop engine)
  useEffect(() => {
    if (!track) return;
    let disposed = false;

    // Initialize MasterSync callbacks when adapter is ready
    const masterSync = masterSyncRef.current;
    if (masterSync) {
      masterSync.setCallbacks(
        (targetTime) => adapterRef.current?.seek(targetTime)
      );
    }

    const interval = window.setInterval(() => {
      const adapter = adapterRef.current;
      const active = playbackRef.current;
      if (!adapter || !adapter.isReady() || disposed) return;

      if (active.status !== 'playing') {
        masterSync?.onPause();
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
        
        if (!masterSync) return;
        
        // Run PLL update - returns rate adjustment and seek decision
        const { rate, shouldSeek, seekTarget } = masterSync.update(position);
        
        // Apply rate adjustment from PLL
        adapter.setRate(rate);
        
        // Hard seek if PLL determines phase error is too large
        if (shouldSeek && seekTarget !== undefined) {
          masterSync.forceSeek(seekTarget);
          lastSeekTime.current = Date.now();
        }

        const target = positionAt(active, clockSync.getServerNow());
        const drift = position - target;
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
      });
    }, 250); // 4Hz update rate for PLL

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [roomCode, track, crossfade, volume]);

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
