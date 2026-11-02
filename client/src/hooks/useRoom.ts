import { useEffect, useState, useCallback, useRef } from 'react';
import type { RoomState, Track, PlaybackState, Participant } from '@vybe/shared';
import { socket } from '../services/socket.js';
import { audioEngine } from '../services/audioEngine.js';
import { ntpClock } from '../services/ntpClock.js';

export function useRoom(initialRoomCode?: string) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [selfId, setSelfId] = useState('');
  const [driftMs, setDriftMs] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlayingLocally, setIsPlayingLocally] = useState(false);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(audioEngine.isUnlocked());
  const [volume, setVolumeState] = useState(0.85);

  const roomRef = useRef<RoomState | null>(null);
  roomRef.current = room;

  const unlockAudio = useCallback(async () => {
    const success = await audioEngine.unlock();
    setIsAudioUnlocked(success);
    if (success && roomRef.current?.playback.status === 'playing') {
      // If room is already playing, start playing immediately!
      void audioEngine.syncPlayback(roomRef.current.playback);
    }
  }, []);

  // Connect socket listeners
  useEffect(() => {
    const handleJoined = (data: { room: RoomState; isHost: boolean; selfId: string }) => {
      setRoom(data.room);
      setIsHost(data.isHost);
      setSelfId(data.selfId);

      // Autonomous new-joiner sync: Apply playback immediately!
      if (data.room.playback.status === 'playing') {
        void audioEngine.syncPlayback(data.room.playback);
      }
    };

    const handleRoomState = (newRoom: RoomState) => {
      setRoom(newRoom);
      setIsHost(newRoom.hostId === socket.id);
    };

    const handlePlaybackSync = (playback: PlaybackState) => {
      setRoom((prev) => (prev ? { ...prev, playback } : prev));
      void audioEngine.syncPlayback(playback);
    };

    const handleParticipantUpdated = (p: Participant) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.map((m) => (m.id === p.id ? p : m)),
        };
      });
    };

    socket.on('room:joined', handleJoined);
    socket.on('room:state', handleRoomState);
    socket.on('playback:sync', handlePlaybackSync);
    socket.on('participant:updated', handleParticipantUpdated);

    // Audio Engine Listeners
    const unsubDrift = audioEngine.addDriftListener((ms) => {
      setDriftMs(ms);
      if (roomRef.current) {
        socket.emit('participant:drift', { roomCode: roomRef.current.code, driftMs: ms });
      }
    });

    const unsubState = audioEngine.addStateListener((isPlaying, pos, dur) => {
      setIsPlayingLocally(isPlaying);
      setCurrentTime(pos);
      if (dur > 0) setDuration(dur);
    });

    audioEngine.setTrackEndedCallback(() => {
      if (roomRef.current) {
        socket.emit('playback:ended', {
          roomCode: roomRef.current.code,
          trackId: roomRef.current.playback.currentTrack?.id || '',
        });
      }
    });

    return () => {
      socket.off('room:joined', handleJoined);
      socket.off('room:state', handleRoomState);
      socket.off('playback:sync', handlePlaybackSync);
      socket.off('participant:updated', handleParticipantUpdated);
      unsubDrift();
      unsubState();
    };
  }, []);

  const createRoom = useCallback(async (username?: string) => {
    await unlockAudio();
    ntpClock.burstPing();
    socket.emit('room:create', { username });
  }, [unlockAudio]);

  const joinRoom = useCallback(async (roomCode: string, username?: string) => {
    await unlockAudio();
    ntpClock.burstPing();
    socket.emit('room:join', { roomCode, username });
  }, [unlockAudio]);

  const leaveRoom = useCallback(() => {
    audioEngine.stop();
    setRoom(null);
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!room) return;
    await unlockAudio();

    if (room.playback.status === 'playing') {
      const currentPos = audioEngine.getCurrentPosition();
      socket.emit('playback:pause', { roomCode: room.code, position: currentPos });
    } else {
      socket.emit('playback:play', { roomCode: room.code });
    }
  }, [room, unlockAudio]);

  const seek = useCallback((positionSec: number) => {
    if (!room) return;
    socket.emit('playback:seek', { roomCode: room.code, position: positionSec });
  }, [room]);

  const skipNext = useCallback(() => {
    if (!room) return;
    socket.emit('queue:skip', { roomCode: room.code });
  }, [room]);

  const addToQueue = useCallback((track: Track) => {
    if (!room) return;
    socket.emit('queue:add', { roomCode: room.code, track });
  }, [room]);

  const removeFromQueue = useCallback((trackId: string) => {
    if (!room) return;
    socket.emit('queue:remove', { roomCode: room.code, trackId });
  }, [room]);

  const setVolume = useCallback((val: number) => {
    setVolumeState(val);
    audioEngine.setVolume(val);
  }, []);

  return {
    room,
    isHost,
    selfId,
    driftMs,
    currentTime,
    duration: duration || room?.playback.currentTrack?.duration || 0,
    isPlayingLocally,
    isAudioUnlocked,
    volume,
    createRoom,
    joinRoom,
    leaveRoom,
    togglePlayPause,
    seek,
    skipNext,
    addToQueue,
    removeFromQueue,
    setVolume,
    unlockAudio,
  };
}

