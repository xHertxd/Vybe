import React, { useState } from 'react';
import type { Track, PlaybackState } from '../types.js';
import { Play, Pause, SkipForward, Volume2, VolumeX, Music, Disc3, Sparkles } from 'lucide-react';
import { formatSeconds } from '../lib/format.js';
import { WaveformVisualizer } from './WaveformVisualizer.js';

interface NowPlayingCardProps {
  playback: PlaybackState;
  currentTime: number;
  duration: number;
  isPlayingLocally: boolean;
  volume: number;
  isConnecting?: boolean;
  onTogglePlayPause: () => void;
  onSeek: (seconds: number) => void;
  onSkipNext: () => void;
  onVolumeChange: (vol: number) => void;
  onOpenSearch: () => void;
}

export const NowPlayingCard: React.FC<NowPlayingCardProps> = ({
  playback,
  currentTime,
  duration,
  isPlayingLocally,
  volume,
  isConnecting = false,
  onTogglePlayPause,
  onSeek,
  onSkipNext,
  onVolumeChange,
  onOpenSearch,
}) => {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);

  const track: Track | null = playback.currentTrack;
  const isPlaying = playback.status === 'playing';

  const displayedTime = isScrubbing ? scrubPosition : currentTime;
  const progressPercent = duration > 0 ? (displayedTime / duration) * 100 : 0;

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setScrubPosition(val);
  };

  const handleScrubEnd = () => {
    setIsScrubbing(false);
    onSeek(scrubPosition);
  };

  const toggleMute = () => {
    onVolumeChange(volume === 0 ? 0.8 : 0);
  };

  return (
    <div className="glass-panel w-full max-w-xl rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60 relative overflow-hidden">
      {/* Background ambient glow */}
      {track?.coverUrl && (
        <div
          className="absolute -inset-10 opacity-20 blur-3xl pointer-events-none transition-all duration-1000"
          style={{
            backgroundImage: `url(${track.coverUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}

      {/* Track Art & Metadata */}
      <div className="relative z-10 flex flex-col items-center text-center">
        {/* Cover Art with Vinyl disc effect */}
        <div className="relative group mb-6">
          <div
            className={`h-48 w-48 sm:h-56 sm:w-56 rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative transition-transform duration-500 ${
              isPlaying ? 'scale-100 ring-2 ring-brand-500/40 shadow-brand-500/20' : 'scale-95 opacity-80'
            }`}
          >
            {track?.coverUrl ? (
              <img
                src={track.coverUrl}
                alt={track.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                <Music className="h-16 w-16 text-zinc-600" />
              </div>
            )}
          </div>

          {/* Vinyl rotating indicator */}
          {isPlaying && (
            <div className="absolute -top-3 -right-3 h-10 w-10 rounded-full bg-zinc-950/80 border border-white/10 flex items-center justify-center backdrop-blur-md">
              <Disc3 className="h-6 w-6 text-brand-400 animate-spin-slow" />
            </div>
          )}
        </div>

        {/* Track Title and Artist */}
        {track ? (
          <div className="mb-4 max-w-full px-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
              {track.title}
            </h2>
            <p className="text-sm font-medium text-zinc-400 mt-1 truncate">
              {track.artist}
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand-500/20 bg-brand-500/10 px-2.5 py-0.5 text-[10px] font-mono text-brand-300">
              <Sparkles className="h-3 w-3 text-brand-400" />
              <span>{track.source === 'freetouse' ? 'FreeToUse Direct Stream' : 'Custom Audio'}</span>
            </div>
          </div>
        ) : isConnecting ? (
          <div className="mb-6 flex flex-col items-center">
            <div className="h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mb-3" />
            <h2 className="text-xl font-semibold text-zinc-200">Connecting to Room...</h2>
            <p className="text-xs text-zinc-400 mt-1">Syncing music queue and audio with host</p>
          </div>
        ) : (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-zinc-300">Queue is empty</h2>
            <p className="text-xs text-zinc-500 mt-1">Search or add a track to start the room</p>
            <button
              onClick={onOpenSearch}
              className="mt-4 rounded-xl bg-gradient-to-r from-brand-600 to-cyan-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:scale-105 active:scale-95"
            >
              Search Music Library
            </button>
          </div>
        )}

        {/* Waveform Visualizer */}
        {track && <WaveformVisualizer isPlaying={isPlayingLocally} />}

        {/* Scrubber Progress Bar */}
        {track && (
          <div className="w-full mt-2">
            <div className="relative flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={displayedTime}
                onMouseDown={() => setIsScrubbing(true)}
                onTouchStart={() => setIsScrubbing(true)}
                onChange={handleScrubChange}
                onMouseUp={handleScrubEnd}
                onTouchEnd={handleScrubEnd}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #8b5cf6 0%, #06b6d4 ${progressPercent}%, rgba(255,255,255,0.1) ${progressPercent}%, rgba(255,255,255,0.1) 100%)`,
                }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] font-mono text-zinc-400 mt-1.5">
              <span>{formatSeconds(displayedTime)}</span>
              <span>{formatSeconds(duration)}</span>
            </div>
          </div>
        )}

        {/* Main Controls */}
        <div className="flex items-center justify-center gap-6 mt-6">
          {/* Main Play/Pause Button */}
          <button
            onClick={onTogglePlayPause}
            className={`h-16 w-16 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 active:scale-90 ${
              isPlaying
                ? 'bg-zinc-800 text-white hover:bg-zinc-700 border border-white/20'
                : 'bg-gradient-to-tr from-brand-600 to-cyan-500 text-white shadow-brand-500/40 hover:scale-105'
            }`}
            title="Play / Pause (Spacebar)"
          >
            {isPlaying ? (
              <Pause className="h-7 w-7 fill-current" />
            ) : (
              <Play className="h-7 w-7 fill-current ml-1" />
            )}
          </button>

          {/* Next / Skip Button */}
          <button
            onClick={onSkipNext}
            className="h-11 w-11 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95"
            title="Next Track"
          >
            <SkipForward className="h-5 w-5" />
          </button>
        </div>

        {/* Volume & Spacebar Hint Bar */}
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-6 border-t border-white/5">
          {/* Volume Slider */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={toggleMute}
              className="text-zinc-400 hover:text-white transition-colors"
              title={volume === 0 ? 'Unmute' : 'Mute'}
            >
              {volume === 0 ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-24 sm:w-28 h-1 bg-white/10 rounded-lg cursor-pointer"
            />
            <span className="font-mono text-[10px] text-zinc-400 min-w-8">
              {Math.round(volume * 100)}%
            </span>
          </div>

          {/* Spacebar Shortcut Badge */}
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-400">
            <kbd className="rounded border border-white/10 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300 font-semibold shadow-sm">
              SPACE
            </kbd>
            <span>Play / Pause</span>
          </div>
        </div>
      </div>
    </div>
  );
};

