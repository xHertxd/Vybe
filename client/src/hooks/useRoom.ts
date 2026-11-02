import { useEffect, useState, useCallback } from 'react';
import type { RoomState, Track } from '../types.js';
import { roomCoordinator } from '../services/roomCoordinator.js';
import { audioEngine } from '../services/audioEngine.js';

export function useRoom() {
  const [room, setRoom] = useState<RoomState | null>(() => roomCoordinator.getCurrentRoom());
  const [driftMs, setDriftMs] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlayingLocally, setIsPlayingLocally] = useState(false);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(audioEngine.isUnlocked());
  const [volume, setVolumeState] = useState(0.85);

  const selfId = roomCoordinator.getSelfId();
  const isHost = room ? room.hostId === selfId : false;

  const unlockAudio = useCallback(async () => {
    const success = await audioEngine.unlock();
    setIsAudioUnlocked(success);
    const active = roomCoordinator.getCurrentRoom();
    if (success && active?.playback.status === 'playing') {
      void audioEngine.syncPlayback(active.playback);
    }
  }, []);

  useEffect(() => {
    // 1. Subscribe to room state updates from coordinator
    const unsubState = roomCoordinator.onRoomState((updatedRoom) => {
      setRoom(updatedRoom);
    });

    // 2. Subscribe to playback updates from coordinator
    const unsubPlayback = roomCoordinator.onPlaybackSync((playback) => {
      void audioEngine.syncPlayback(playback);
    });

    // 3. Subscribe to audio engine state (actual playing time / duration)
    const unsubAudioState = audioEngine.addStateListener((isPlaying, pos, dur) => {
      setIsPlayingLocally(isPlaying);
      setCurrentTime(pos);
      if (dur > 0) setDuration(dur);
    });

    // 4. Subscribe to drift updates and report to peers
    const unsubDrift = audioEngine.addDriftListener((drift) => {
      setDriftMs(drift);
      roomCoordinator.reportDrift(drift);
    });

    // 5. Track end auto-skip
    audioEngine.setTrackEndedCallback(() => {
      roomCoordinator.skipNext();
    });

    return () => {
      unsubState();
      unsubPlayback();
      unsubAudioState();
      unsubDrift();
    };
  }, []);

  const createRoom = useCallback(async (username?: string) => {
    await unlockAudio();
    const newRoom = roomCoordinator.createRoom(username);
    setRoom(newRoom);
  }, [unlockAudio]);

  const joinRoom = useCallback(async (roomCode: string, username?: string) => {
    await unlockAudio();
    const joined = roomCoordinator.joinRoom(roomCode, username);
    setRoom(joined);
  }, [unlockAudio]);

  const leaveRoom = useCallback(() => {
    audioEngine.stop();
    roomCoordinator.leaveRoom();
    setRoom(null);
  }, []);

  const togglePlayPause = useCallback(async () => {
    await unlockAudio();
    const currentPos = audioEngine.getCurrentPosition();
    roomCoordinator.togglePlayPause(currentPos);
  }, [unlockAudio]);

  const seek = useCallback((positionSec: number) => {
    roomCoordinator.seek(positionSec);
  }, []);

  const skipNext = useCallback(() => {
    roomCoordinator.skipNext();
  }, []);

  const addToQueue = useCallback((track: Track) => {
    roomCoordinator.addToQueue(track);
  }, []);

  const removeFromQueue = useCallback((trackId: string) => {
    roomCoordinator.removeFromQueue(trackId);
  }, []);

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
