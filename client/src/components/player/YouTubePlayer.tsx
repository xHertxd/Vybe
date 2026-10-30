import React, { useEffect, useRef, useState } from 'react';
import type { UnifiedMediaItem, PlaybackState } from '../../types.js';
import { syncEngine, type PlayerAdapter } from '../../services/syncEngine.js';
import { socket } from '../../services/socket.js';
import { AlertTriangle, SkipForward, Play, Maximize2, Minimize2, Video, Music } from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerProps {
  track: UnifiedMediaItem | null;
  playbackState: PlaybackState;
  roomCode: string;
  isAdmin: boolean;
  localVolume: number;
  sharedVolume: number;
  viewMode: 'video' | 'audio';
  onToggleViewMode: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  track,
  playbackState,
  roomCode,
  isAdmin,
  localVolume,
  sharedVolume,
  viewMode,
  onToggleViewMode,
  onTimeUpdate
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [isLargeTheater, setIsLargeTheater] = useState(false);
  const [needsAutoplayUnlock, setNeedsAutoplayUnlock] = useState(false);

  // Load YouTube IFrame API script once
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Initialize or re-cue player when track changes
  useEffect(() => {
    if (!track || track.provider !== 'youtube') {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          // ignore
        }
        playerRef.current = null;
      }
      setIsPlayerReady(false);
      setEmbedError(null);
      return;
    }

    setEmbedError(null);

    const initPlayer = () => {
      const elementId = 'vybe-youtube-iframe-holder';
      let holder = document.getElementById(elementId);
      if (!holder && containerRef.current) {
        holder = document.createElement('div');
        holder.id = elementId;
        containerRef.current.appendChild(holder);
      }

      if (!holder) return;

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          // ignore
        }
      }

      try {
        playerRef.current = new window.YT.Player(elementId, {
          height: '100%',
          width: '100%',
          videoId: track.mediaId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin
          },
          events: {
            onReady: (event: any) => {
              setIsPlayerReady(true);
              const vol = Math.max(0, Math.min(100, (localVolume / 100) * sharedVolume));
              event.target.setVolume(vol);
              // Trigger initial sync alignment
              syncEngine.onPlaybackSync(playbackState);
            },
            onStateChange: (event: any) => {
              // 0: ended
              if (event.data === window.YT.PlayerState.ENDED) {
                if (roomCode) {
                  socket.emit('playback:track_ended', { roomCode, trackId: track.id });
                }
              }
            },
            onError: (event: any) => {
              console.error('YouTube Player Error:', event.data);
              // 101 or 150: Video embedding restricted
              if (event.data === 101 || event.data === 150) {
                setEmbedError('The owner of this YouTube video does not allow external playback embedding.');
              } else if (event.data === 100) {
                setEmbedError('The requested YouTube video was not found or has been removed.');
              } else {
                setEmbedError('Unable to play this YouTube video due to playback restrictions.');
              }
            }
          }
        });
      } catch (err) {
        console.error('Failed to create YouTube player:', err);
      }
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    }

    return () => {
      // Cleanup on unmount or track switch
    };
  }, [track?.mediaId, track?.provider]);

  // Adjust volume
  useEffect(() => {
    if (playerRef.current && isPlayerReady && playerRef.current.setVolume) {
      try {
        const vol = Math.max(0, Math.min(100, (localVolume / 100) * sharedVolume));
        playerRef.current.setVolume(vol);
      } catch (e) {
        // ignore
      }
    }
  }, [localVolume, sharedVolume, isPlayerReady]);

  // Register Sync Adapter for YouTube
  useEffect(() => {
    if (!track || track.provider !== 'youtube' || !isPlayerReady || !playerRef.current) {
      return;
    }

    const player = playerRef.current;

    const adapter: PlayerAdapter = {
      getCurrentTime: () => {
        try {
          return player.getCurrentTime ? player.getCurrentTime() : 0;
        } catch {
          return 0;
        }
      },
      seekTo: (seconds: number) => {
        try {
          if (player.seekTo && isFinite(seconds)) {
            player.seekTo(seconds, true);
          }
        } catch (e) {
          console.warn('YouTube seekTo failed:', e);
        }
      },
      setPlaybackRate: (rate: number) => {
        try {
          if (player.setPlaybackRate && isFinite(rate)) {
            // YouTube accepts 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2
            player.setPlaybackRate(rate);
          }
        } catch (e) {
          // ignore
        }
      },
      play: () => {
        try {
          if (player.playVideo) {
            player.playVideo();
            setNeedsAutoplayUnlock(false);
          }
        } catch (e) {
          setNeedsAutoplayUnlock(true);
        }
      },
      pause: () => {
        try {
          if (player.pauseVideo) {
            player.pauseVideo();
          }
        } catch (e) {
          // ignore
        }
      },
      isPlaying: () => {
        try {
          return player.getPlayerState && player.getPlayerState() === window.YT.PlayerState.PLAYING;
        } catch {
          return false;
        }
      },
      isReady: () => isPlayerReady && !!player
    };

    syncEngine.setAdapter(adapter);

    // Time ticker for progress bar
    const timeInterval = setInterval(() => {
      if (player && player.getCurrentTime && onTimeUpdate) {
        try {
          const current = player.getCurrentTime();
          const duration = player.getDuration() || track.duration || 0;
          onTimeUpdate(current, duration);
        } catch {
          // ignore
        }
      }
    }, 500);

    return () => {
      clearInterval(timeInterval);
      syncEngine.setAdapter(null);
    };
  }, [track, isPlayerReady, onTimeUpdate]);

  if (!track || track.provider !== 'youtube') {
    return null;
  }

  const handleSkipUnplayable = () => {
    if (isAdmin && roomCode) {
      socket.emit('playback:next', { roomCode });
    }
  };

  const handleAutoplayUnlock = () => {
    if (playerRef.current && playerRef.current.playVideo) {
      playerRef.current.playVideo();
      setNeedsAutoplayUnlock(false);
      syncEngine.onPlaybackSync(playbackState);
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Top Controls: Mode Switch & Theater Size */}
      <div className="w-full flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleViewMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              viewMode === 'video'
                ? 'bg-purple-600/30 border-purple-500/50 text-purple-300'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            {viewMode === 'video' ? <Video className="w-3.5 h-3.5" /> : <Music className="w-3.5 h-3.5" />}
            {viewMode === 'video' ? 'Video Mode' : 'Audio Mode'}
          </button>
        </div>

        {viewMode === 'video' && (
          <button
            onClick={() => setIsLargeTheater(!isLargeTheater)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors"
          >
            {isLargeTheater ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {isLargeTheater ? 'Compact' : 'Theater View'}
          </button>
        )}
      </div>

      {/* Embedding restriction error notification */}
      {embedError && (
        <div className="w-full max-w-lg mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 backdrop-blur-md">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-amber-200">
            <p className="font-semibold text-amber-300">YouTube Embed Restricted</p>
            <p className="mt-1 text-xs text-amber-200/90 leading-relaxed">{embedError}</p>
            {isAdmin && (
              <button
                onClick={handleSkipUnplayable}
                className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold rounded-lg shadow-md transition-colors"
              >
                <SkipForward className="w-3.5 h-3.5" />
                Skip this Track
              </button>
            )}
          </div>
        </div>
      )}

      {/* YouTube Video Container */}
      <div
        className={`relative overflow-hidden rounded-2xl bg-black border border-white/10 shadow-2xl transition-all duration-300 ${
          viewMode === 'video'
            ? isLargeTheater
              ? 'w-full aspect-video max-w-4xl max-h-[65vh]'
              : 'w-full aspect-video max-w-lg max-h-[340px]'
            : 'w-1 h-1 opacity-0 pointer-events-none absolute -top-[9999px]'
        }`}
      >
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Autoplay blocker prompt */}
      {needsAutoplayUnlock && (
        <div
          onClick={handleAutoplayUnlock}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-cyan-600/95 hover:bg-cyan-500 text-white px-6 py-3 rounded-full shadow-2xl cursor-pointer border border-cyan-400/40 backdrop-blur-md transition-transform hover:scale-105 active:scale-95 animate-bounce"
        >
          <Play className="w-5 h-5 fill-white" />
          <span className="text-sm font-medium">Click to synchronize and join video</span>
        </div>
      )}
    </div>
  );
};
