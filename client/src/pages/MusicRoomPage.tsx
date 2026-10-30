import React, { useState, useEffect } from 'react';
import type { RoomState, RoomUser, SyncMetrics, UnifiedMediaItem } from '../types.js';
import { socket } from '../services/socket.js';
import { syncEngine } from '../services/syncEngine.js';
import { HTML5AudioPlayer } from '../components/player/HTML5AudioPlayer.js';
import { YouTubePlayer } from '../components/player/YouTubePlayer.js';
import { SpotifyPlayer } from '../components/player/SpotifyPlayer.js';
import { UnifiedQueue } from '../components/queue/UnifiedQueue.js';
import { ParticipantsList } from '../components/room/ParticipantsList.js';
import { AudioWaveformVisualizer } from '../components/visualizer/AudioWaveformVisualizer.js';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Crown,
  Radio,
  ListMusic,
  Users
} from 'lucide-react';

interface MusicRoomPageProps {
  initialState: RoomState;
  currentUser: RoomUser;
  onExit: () => void;
}

export const MusicRoomPage: React.FC<MusicRoomPageProps> = ({
  initialState,
  currentUser: initialUser,
  onExit
}) => {
  const [roomState, setRoomState] = useState<RoomState>(initialState);
  const [currentUser, setCurrentUser] = useState<RoomUser>(initialUser);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'users'>('queue');
  const [localVolume, setLocalVolume] = useState<number>(85);
  const [isMuted, setIsMuted] = useState(false);
  const [youtubeViewMode, setYoutubeViewMode] = useState<'video' | 'audio'>('video');

  // Playback timer & progress state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);

  // Sync metrics from sync engine
  const [metrics, setMetrics] = useState<SyncMetrics>({
    ping: 15,
    clockOffset: 0,
    drift: 0,
    inSync: true,
    correctionMode: 'none'
  });

  const isAdmin = currentUser.isAdmin;
  const currentTrack = roomState.playback.currentTrack;
  const isPlaying = roomState.playback.status === 'playing';

  // Bind Room to Sync Engine
  useEffect(() => {
    syncEngine.setRoom(roomState.roomCode);

    const unsubMetrics = syncEngine.subscribeMetrics((newMetrics) => {
      setMetrics(newMetrics);
    });

    return () => {
      unsubMetrics();
      syncEngine.setRoom(null);
    };
  }, [roomState.roomCode]);

  // Listen for real-time room updates
  useEffect(() => {
    const handleRoomState = (newState: RoomState) => {
      setRoomState(newState);
      // Update currentUser from the updated user list
      const me = newState.users.find((u) => u.id === currentUser.id);
      if (me) {
        setCurrentUser(me);
      }
    };

    const handlePlaybackSync = (data: any) => {
      setRoomState((prev) => ({
        ...prev,
        playback: data
      }));
      syncEngine.onPlaybackSync(data);
    };

    const handleQueueUpdated = (data: { queue: UnifiedMediaItem[]; currentIndex: number }) => {
      setRoomState((prev) => ({
        ...prev,
        queue: data.queue,
        currentIndex: data.currentIndex
      }));
    };

    const handleSettingsUpdated = (settings: any) => {
      setRoomState((prev) => ({
        ...prev,
        settings
      }));
    };

    const handleAdminChanged = (data: { newAdminId: string; username: string }) => {
      setRoomState((prev) => {
        const updatedUsers = prev.users.map((u) => ({
          ...u,
          isAdmin: u.id === data.newAdminId
        }));
        return {
          ...prev,
          adminId: data.newAdminId,
          users: updatedUsers
        };
      });

      if (currentUser.id === data.newAdminId) {
        setCurrentUser((prev) => ({ ...prev, isAdmin: true }));
      }
    };

    const handleRoomEnded = () => {
      alert('This room has been ended by the admin.');
      onExit();
    };

    socket.on('room:state', handleRoomState);
    socket.on('playback:sync', handlePlaybackSync);
    socket.on('queue:updated', handleQueueUpdated);
    socket.on('settings:updated', handleSettingsUpdated);
    socket.on('room:admin_changed', handleAdminChanged);
    socket.on('room:ended', handleRoomEnded);

    return () => {
      socket.off('room:state', handleRoomState);
      socket.off('playback:sync', handlePlaybackSync);
      socket.off('queue:updated', handleQueueUpdated);
      socket.off('settings:updated', handleSettingsUpdated);
      socket.off('room:admin_changed', handleAdminChanged);
      socket.off('room:ended', handleRoomEnded);
    };
  }, [currentUser.id, onExit]);

  // Track time ticker for non-video audio
  useEffect(() => {
    if (!currentTrack) {
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    setDuration(currentTrack.duration || 180);

    const interval = setInterval(() => {
      if (!isScrubbing) {
        const authorTime = syncEngine.getAuthoritativePosition();
        setCurrentTime(authorTime);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [currentTrack, isScrubbing]);

  // Copy Room Code Helper
  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomState.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Playback Control Handlers (Admin Only)
  const handleTogglePlay = () => {
    if (!isAdmin) return;
    if (isPlaying) {
      socket.emit('playback:pause', { roomCode: roomState.roomCode });
    } else {
      socket.emit('playback:play', { roomCode: roomState.roomCode });
    }
  };

  const handleNextTrack = () => {
    if (!isAdmin) return;
    socket.emit('playback:next', { roomCode: roomState.roomCode });
  };

  const handlePrevTrack = () => {
    if (!isAdmin) return;
    socket.emit('playback:prev', { roomCode: roomState.roomCode });
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) return;
    const pos = parseFloat(e.target.value);
    setScrubPosition(pos);
    setIsScrubbing(true);
  };

  const handleSeekCommit = () => {
    if (!isAdmin) return;
    setIsScrubbing(false);
    socket.emit('playback:seek', {
      roomCode: roomState.roomCode,
      position: scrubPosition
    });
  };

  const handleToggleShuffle = () => {
    if (!isAdmin) return;
    socket.emit('settings:update', {
      roomCode: roomState.roomCode,
      settings: { isShuffle: !roomState.settings.isShuffle }
    });
  };

  const handleToggleRepeat = () => {
    if (!isAdmin) return;
    const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
    const nextIdx = (modes.indexOf(roomState.settings.repeatMode) + 1) % modes.length;
    socket.emit('settings:update', {
      roomCode: roomState.roomCode,
      settings: { repeatMode: modes[nextIdx] }
    });
  };

  const handleLeaveRoom = () => {
    socket.emit('room:leave', { roomCode: roomState.roomCode });
    onExit();
  };

  const handleEndRoom = () => {
    if (!isAdmin) return;
    socket.emit('room:end', { roomCode: roomState.roomCode });
    onExit();
  };

  // Time formatter
  const formatTime = (secs: number) => {
    const safeSecs = Math.max(0, Math.floor(secs));
    const m = Math.floor(safeSecs / 60);
    const s = safeSecs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const currentDisplayTime = isScrubbing ? scrubPosition : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, (currentDisplayTime / duration) * 100) : 0;

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-[#090a10] text-slate-100 overflow-x-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/3 w-[600px] h-[300px] bg-purple-600/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[300px] bg-cyan-600/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Synchronized Media Engines (Audio & Video) */}
      <HTML5AudioPlayer
        track={currentTrack}
        playbackState={roomState.playback}
        roomCode={roomState.roomCode}
        localVolume={isMuted ? 0 : localVolume}
        sharedVolume={roomState.settings.sharedVolume}
        onTimeUpdate={(time, dur) => {
          if (!isScrubbing) {
            setCurrentTime(time);
            if (dur > 0) setDuration(dur);
          }
        }}
      />

      {/* Top Header */}
      <header className="w-full border-b border-white/10 bg-[#0e101a]/70 backdrop-blur-xl px-4 py-3 flex items-center justify-between z-20 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center shadow-md">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <span className="font-black text-sm tracking-wide text-white hidden sm:inline">
            VYBE
          </span>

          {/* 6-Digit Room Code with One-Click Copy */}
          <div className="flex items-center gap-1.5 ml-2 px-3 py-1 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors">
            <span className="text-[11px] text-slate-400 font-medium">Room</span>
            <span className="text-xs font-mono font-bold tracking-widest text-purple-300">
              {roomState.roomCode}
            </span>
            <button
              onClick={handleCopyCode}
              className="ml-1 p-1 text-slate-400 hover:text-white transition-colors"
              title="Copy Room Code"
            >
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Center: Sync Health Status Indicator */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/10 text-xs font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              metrics.inSync
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                : 'bg-amber-400'
            }`}
          />
          <span className="text-slate-300 text-[11px] hidden sm:inline">
            Sync Drift: <strong className="text-white">{metrics.drift}ms</strong>
          </span>
          <span className="text-slate-500 text-[11px]">({metrics.ping}ms ping)</span>
        </div>

        {/* Right: User Role Badge & Leave Button */}
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <span className="flex items-center gap-1 text-[11px] bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/40 text-amber-300 font-bold px-2 py-1 rounded-lg shadow-sm">
              <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              ADMIN
            </span>
          ) : (
            <span className="text-[11px] bg-white/10 text-slate-300 px-2 py-1 rounded-lg font-medium">
              LISTENER
            </span>
          )}

          <button
            onClick={handleLeaveRoom}
            className="px-2.5 py-1 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            Leave
          </button>
        </div>
      </header>

      {/* Main Room Layout: Player Stage + Queue / Participants Panel */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10">
        {/* Left / Center: Synchronized Player Stage */}
        <div className="lg:col-span-8 flex flex-col items-center justify-between bg-[#12141e]/70 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-2xl relative">
          {/* YouTube Player Component (Video or Audio mode) */}
          {currentTrack?.provider === 'youtube' && (
            <div className="w-full mb-4">
              <YouTubePlayer
                track={currentTrack}
                playbackState={roomState.playback}
                roomCode={roomState.roomCode}
                isAdmin={isAdmin}
                localVolume={isMuted ? 0 : localVolume}
                sharedVolume={roomState.settings.sharedVolume}
                viewMode={youtubeViewMode}
                onToggleViewMode={() =>
                  setYoutubeViewMode(youtubeViewMode === 'video' ? 'audio' : 'video')
                }
                onTimeUpdate={(time, dur) => {
                  if (!isScrubbing) {
                    setCurrentTime(time);
                    if (dur > 0) setDuration(dur);
                  }
                }}
              />
            </div>
          )}

          {/* Spotify Player Component */}
          {currentTrack?.provider === 'spotify' && (
            <SpotifyPlayer
              track={currentTrack}
              playbackState={roomState.playback}
              roomCode={roomState.roomCode}
              isAdmin={isAdmin}
              onTimeUpdate={(time, dur) => {
                if (!isScrubbing) {
                  setCurrentTime(time);
                  if (dur > 0) setDuration(dur);
                }
              }}
            />
          )}

          {/* Center Stage: Artwork & Waveform (When not in YouTube video mode) */}
          {(currentTrack?.provider !== 'youtube' || youtubeViewMode === 'audio') && (
            <div className="w-full flex flex-col items-center my-auto py-4">
              <div className="relative group">
                {/* Artwork with subtle neon glow */}
                <div className="w-56 h-56 md:w-64 md:h-64 rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-black/40 relative">
                  <img
                    src={
                      currentTrack?.thumbnail ||
                      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80'
                    }
                    alt={currentTrack?.title || 'Track Art'}
                    className={`w-full h-full object-cover transition-transform duration-700 ${
                      isPlaying ? 'scale-105' : 'scale-100'
                    }`}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Animated Waveform Overlay */}
                <div className="w-56 md:w-64 h-12 mt-4 opacity-75">
                  <AudioWaveformVisualizer isPlaying={isPlaying} barCount={26} />
                </div>
              </div>
            </div>
          )}

          {/* Track Information Display */}
          <div className="w-full max-w-xl text-center mt-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase font-bold text-slate-400 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              {currentTrack?.provider || 'Direct Audio'}
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white truncate px-4">
              {currentTrack?.title || 'No track playing'}
            </h2>
            <p className="text-xs md:text-sm text-slate-400 truncate mt-1">
              {currentTrack?.artist || 'Add a song to the queue to begin'}
            </p>
          </div>

          {/* Progress Bar & Timers */}
          <div className="w-full max-w-xl mt-6">
            <div className="relative group flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.5}
                value={currentDisplayTime}
                onChange={handleSeekChange}
                onMouseUp={handleSeekCommit}
                onTouchEnd={handleSeekCommit}
                disabled={!isAdmin}
                className={`w-full h-2 rounded-lg cursor-pointer ${
                  isAdmin ? 'accent-purple-500' : 'cursor-default opacity-80'
                }`}
                style={{
                  background: `linear-gradient(to right, #8b5cf6 ${progressPercent}%, rgba(255,255,255,0.1) ${progressPercent}%)`
                }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 mt-2 px-0.5">
              <span>{formatTime(currentDisplayTime)}</span>
              {!isAdmin && (
                <span className="text-[10px] text-slate-500 italic">
                  Admin controls shared seek
                </span>
              )}
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Synchronized Playback Controls */}
          <div className="w-full max-w-xl flex items-center justify-between mt-6 pt-4 border-t border-white/5">
            {/* Left: Shuffle & Repeat (Admin only) */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleShuffle}
                disabled={!isAdmin}
                className={`p-2 rounded-xl transition-all ${
                  roomState.settings.isShuffle
                    ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                } ${!isAdmin && 'opacity-40 cursor-not-allowed'}`}
                title={isAdmin ? 'Toggle Shuffle' : 'Admin controls shuffle'}
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button
                onClick={handleToggleRepeat}
                disabled={!isAdmin}
                className={`p-2 rounded-xl transition-all ${
                  roomState.settings.repeatMode !== 'off'
                    ? 'text-purple-400 bg-purple-500/10 border border-purple-500/30 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                } ${!isAdmin && 'opacity-40 cursor-not-allowed'}`}
                title={isAdmin ? `Repeat: ${roomState.settings.repeatMode}` : 'Admin controls repeat'}
              >
                {roomState.settings.repeatMode === 'one' ? (
                  <Repeat1 className="w-4 h-4" />
                ) : (
                  <Repeat className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Center: Previous, Play/Pause, Next */}
            <div className="flex items-center gap-4">
              <button
                onClick={handlePrevTrack}
                disabled={!isAdmin}
                className={`p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition-transform active:scale-95 ${
                  !isAdmin && 'opacity-30 cursor-not-allowed'
                }`}
                title="Previous Track"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              <button
                onClick={handleTogglePlay}
                disabled={!isAdmin}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-xl active:scale-95 ${
                  isAdmin
                    ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/40 hover:scale-105'
                    : 'bg-white/10 text-slate-400 cursor-not-allowed'
                }`}
                title={isAdmin ? (isPlaying ? 'Pause' : 'Play') : 'Playback synchronized by Admin'}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 fill-white" />
                ) : (
                  <Play className="w-6 h-6 fill-white ml-0.5" />
                )}
              </button>

              <button
                onClick={handleNextTrack}
                disabled={!isAdmin}
                className={`p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition-transform active:scale-95 ${
                  !isAdmin && 'opacity-30 cursor-not-allowed'
                }`}
                title="Next Track"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            {/* Right: Local Volume Slider */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-slate-400 hover:text-white transition-colors"
                title="Mute / Unmute Local Audio"
              >
                {isMuted || localVolume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : localVolume}
                onChange={(e) => {
                  setLocalVolume(parseInt(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                className="w-16 md:w-20 h-1.5 rounded-lg accent-purple-500 cursor-pointer"
                title={`Your Local Volume: ${localVolume}%`}
              />
            </div>
          </div>
        </div>

        {/* Right Panel: Tabs for Unified Queue & Connected Participants */}
        <div className="lg:col-span-4 flex flex-col bg-[#12141e]/70 border border-white/10 rounded-3xl p-5 backdrop-blur-xl shadow-2xl h-[560px] lg:h-auto">
          {/* Tab Selection */}
          <div className="flex gap-2 p-1 bg-black/30 rounded-xl mb-4 border border-white/5">
            <button
              onClick={() => setActiveTab('queue')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'queue'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              Queue ({roomState.queue.length})
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'users'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Participants ({roomState.users.length})
            </button>
          </div>

          {/* Active Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'queue' ? (
              <UnifiedQueue
                queue={roomState.queue}
                currentIndex={roomState.currentIndex}
                roomCode={roomState.roomCode}
                isAdmin={isAdmin}
                username={currentUser.username}
              />
            ) : (
              <ParticipantsList
                users={roomState.users}
                currentUserId={currentUser.id}
                isAdmin={isAdmin}
                roomCode={roomState.roomCode}
                metrics={metrics}
                onLeaveRoom={handleLeaveRoom}
                onEndRoom={handleEndRoom}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
