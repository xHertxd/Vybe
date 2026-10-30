import React, { useEffect, useRef, useState } from 'react';
import type { UnifiedMediaItem, PlaybackState } from '../../types.js';
import { syncEngine, type PlayerAdapter } from '../../services/syncEngine.js';
import { socket, getApiUrl } from '../../services/socket.js';
import { Play } from 'lucide-react';

interface HTML5AudioPlayerProps {
  track: UnifiedMediaItem | null;
  playbackState: PlaybackState;
  roomCode: string;
  localVolume: number;
  sharedVolume: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onNeedInteraction?: (needed: boolean) => void;
}

export const HTML5AudioPlayer: React.FC<HTML5AudioPlayerProps> = ({
  track,
  playbackState,
  roomCode,
  localVolume,
  sharedVolume,
  onTimeUpdate,
  onNeedInteraction
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [blockedAutoplay, setBlockedAutoplay] = useState(false);

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      const vol = Math.max(0, Math.min(1, (localVolume / 100) * (sharedVolume / 100)));
      audioRef.current.volume = vol;
    }
  }, [localVolume, sharedVolume]);

  // Set up Sync Adapter for HTML5 Audio
  useEffect(() => {
    if (!track || track.provider === 'youtube') {
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    const adapter: PlayerAdapter = {
      getCurrentTime: () => (audio ? audio.currentTime : 0),
      seekTo: (seconds: number) => {
        if (audio && isFinite(seconds) && Math.abs(audio.currentTime - seconds) > 0.05) {
          try {
            audio.currentTime = seconds;
          } catch (e) {
            console.warn('Seek failed:', e);
          }
        }
      },
      setPlaybackRate: (rate: number) => {
        if (audio && isFinite(rate)) {
          audio.playbackRate = Math.max(0.5, Math.min(2.0, rate));
        }
      },
      play: async () => {
        if (audio) {
          try {
            await audio.play();
            setBlockedAutoplay(false);
            if (onNeedInteraction) onNeedInteraction(false);
          } catch (err: any) {
            if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
              setBlockedAutoplay(true);
              if (onNeedInteraction) onNeedInteraction(true);
            }
          }
        }
      },
      pause: () => {
        if (audio) {
          audio.pause();
        }
      },
      isPlaying: () => {
        return !!(audio && !audio.paused && !audio.ended && audio.readyState > 2);
      },
      isReady: () => isReady && !!audio.currentSrc
    };

    syncEngine.setAdapter(adapter);

    return () => {
      syncEngine.setAdapter(null);
    };
  }, [track, isReady, onNeedInteraction]);

  // Handle track load and events
  const handleCanPlay = () => {
    setIsReady(true);
    syncEngine.onPlaybackSync(playbackState);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current && onTimeUpdate) {
      onTimeUpdate(audioRef.current.currentTime, audioRef.current.duration || track?.duration || 0);
    }
  };

  const handleEnded = () => {
    if (track && roomCode) {
      socket.emit('playback:track_ended', { roomCode, trackId: track.id });
    }
  };

  const handleManualUnlock = () => {
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        setBlockedAutoplay(false);
        if (onNeedInteraction) onNeedInteraction(false);
        syncEngine.onPlaybackSync(playbackState);
      }).catch(console.error);
    }
  };

  if (!track || track.provider === 'youtube') {
    return null;
  }

  // Determine media URL (handle relative /uploads/ or absolute url)
  const mediaSrc = track.url.startsWith('/') && !track.url.startsWith('//')
    ? getApiUrl(track.url)
    : track.url;

  return (
    <>
      <audio
        ref={audioRef}
        src={mediaSrc}
        preload="auto"
        onCanPlay={handleCanPlay}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />

      {blockedAutoplay && (
        <div
          onClick={handleManualUnlock}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-purple-600/95 hover:bg-purple-500 text-white px-6 py-3 rounded-full shadow-2xl cursor-pointer border border-purple-400/40 backdrop-blur-md transition-transform hover:scale-105 active:scale-95 animate-bounce"
        >
          <Play className="w-5 h-5 fill-white" />
          <span className="text-sm font-medium">Click to synchronize and enable audio</span>
        </div>
      )}
    </>
  );
};
