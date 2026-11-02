import type { RoomState, PlaybackState, Track, Participant } from '../types.js';
import { socket } from './socket.js';
import { audioEngine } from './audioEngine.js';
import { ntpClock } from './ntpClock.js';

type StateListener = (room: RoomState) => void;
type PlaybackListener = (playback: PlaybackState) => void;

class RoomCoordinator {
  private currentRoom: RoomState | null = null;
  private selfId: string;
  private username: string;
  private stateListeners = new Set<StateListener>();
  private playbackListeners = new Set<PlaybackListener>();

  constructor() {
    this.selfId = 'p_' + Math.random().toString(36).slice(2, 9);
    this.username =
      typeof window !== 'undefined'
        ? localStorage.getItem('vybe_username') || `Guest_${this.selfId.slice(2, 6)}`
        : 'Guest';

    // Hardware clock sync: Audio engine references the NTP server clock
    audioEngine.setClockProvider(() => ntpClock.getServerNow());
    this.setupSocketHandlers();
  }

  public getSelfId(): string {
    return this.selfId;
  }

  public getUsername(): string {
    return this.username;
  }

  public getCurrentRoom(): RoomState | null {
    return this.currentRoom;
  }

  public onRoomState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    if (this.currentRoom) listener(this.currentRoom);
    return () => this.stateListeners.delete(listener);
  }

  public onPlaybackSync(listener: PlaybackListener): () => void {
    this.playbackListeners.add(listener);
    if (this.currentRoom) listener(this.currentRoom.playback);
    return () => this.playbackListeners.delete(listener);
  }

  private notifyState(room: RoomState): void {
    this.currentRoom = room;
    this.stateListeners.forEach((fn) => fn(room));
  }

  private notifyPlayback(playback: PlaybackState): void {
    if (this.currentRoom) {
      this.currentRoom = { ...this.currentRoom, playback };
    }
    this.playbackListeners.forEach((fn) => fn(playback));
  }

  private setupSocketHandlers(): void {
    // 1. Authoritative room state on join/create
    socket.on('room:joined', ({ room, selfId }: { room: RoomState; selfId?: string }) => {
      if (selfId) this.selfId = selfId;
      this.notifyState(room);
      if (room.playback) {
        this.notifyPlayback(room.playback);
      }
    });

    // 2. Real-time room updates (queue changes, participant lists, admin transfer)
    socket.on('room:state', (room: RoomState) => {
      this.notifyState(room);
    });

    // 3. Playback updates (play, pause, seek, scheduled start)
    socket.on('playback:sync', (playback: PlaybackState) => {
      this.notifyPlayback(playback);
    });

    // 4. Kicked from room by host
    socket.on('room:kicked', () => {
      alert('You have been removed from the room by the host.');
      this.leaveRoom();
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/');
        window.location.href = '/';
      }
    });

    // 5. Automatic reconnection recovery
    socket.on('connect', () => {
      if (this.currentRoom?.code) {
        socket.emit('room:join', {
          roomCode: this.currentRoom.code,
          username: this.username,
        });
      }
    });
  }

  // -------------------------------------------------------------
  // Public Room Actions
  // -------------------------------------------------------------

  public createRoom(username?: string): RoomState {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const name = username?.trim() || this.username;
    this.username = name;
    localStorage.setItem('vybe_username', name);

    const initialHost: Participant = {
      id: this.selfId,
      username: name,
      isHost: true,
      driftMs: 0,
      joinedAt: Date.now(),
    };

    const initialPlayback: PlaybackState = {
      status: 'stopped',
      currentTrack: null,
      position: 0,
      serverTimestamp: Date.now(),
      scheduledStartTime: null,
      playbackRate: 1.0,
    };

    const room: RoomState = {
      code,
      hostId: this.selfId,
      playback: initialPlayback,
      queue: [],
      queueIndex: 0,
      participants: [initialHost],
    };

    this.notifyState(room);
    socket.emit('room:create', { roomCode: code, username: name });
    return room;
  }

  public joinRoom(roomCode: string, username?: string): RoomState {
    const code = roomCode.trim();
    const name = username?.trim() || this.username;
    this.username = name;
    localStorage.setItem('vybe_username', name);

    const self: Participant = {
      id: this.selfId,
      username: name,
      isHost: false,
      driftMs: 0,
      joinedAt: Date.now(),
    };

    const placeholderRoom: RoomState = {
      code,
      hostId: '',
      playback: {
        status: 'stopped',
        currentTrack: null,
        position: 0,
        serverTimestamp: Date.now(),
        scheduledStartTime: null,
        playbackRate: 1.0,
      },
      queue: [],
      queueIndex: 0,
      participants: [self],
    };

    this.notifyState(placeholderRoom);
    socket.emit('room:join', { roomCode: code, username: name });
    return placeholderRoom;
  }

  public leaveRoom(): void {
    if (this.currentRoom) {
      socket.emit('room:leave', { roomCode: this.currentRoom.code });
    }
    this.currentRoom = null;
  }

  public togglePlayPause(currentPosition: number): void {
    if (!this.currentRoom) return;
    const isPlaying = this.currentRoom.playback.status === 'playing';
    socket.emit(isPlaying ? 'playback:pause' : 'playback:play', {
      roomCode: this.currentRoom.code,
      position: currentPosition,
    });
  }

  public seek(positionSec: number): void {
    if (!this.currentRoom) return;
    socket.emit('playback:seek', {
      roomCode: this.currentRoom.code,
      position: positionSec,
    });
  }

  public skipNext(): void {
    if (!this.currentRoom) return;
    socket.emit('queue:skip', { roomCode: this.currentRoom.code });
  }

  public addToQueue(track: Track): void {
    if (!this.currentRoom) return;
    socket.emit('queue:add', { roomCode: this.currentRoom.code, track });
  }

  public addMultipleToQueue(tracks: Track[]): void {
    if (!this.currentRoom || tracks.length === 0) return;
    socket.emit('queue:add_multiple', { roomCode: this.currentRoom.code, tracks });
  }

  public reorderQueue(fromIndex: number, toIndex: number): void {
    if (!this.currentRoom) return;
    socket.emit('queue:reorder', { roomCode: this.currentRoom.code, fromIndex, toIndex });
  }

  public transferAdmin(newHostId: string): void {
    if (!this.currentRoom) return;
    socket.emit('room:transfer_host', { roomCode: this.currentRoom.code, newHostId });
  }

  public kickParticipant(targetUserId: string): void {
    if (!this.currentRoom) return;
    socket.emit('room:kick', { roomCode: this.currentRoom.code, targetUserId });
  }

  public removeFromQueue(trackId: string): void {
    if (!this.currentRoom) return;
    socket.emit('queue:remove', { roomCode: this.currentRoom.code, trackId });
  }

  public reportDrift(driftMs: number): void {
    if (!this.currentRoom) return;
    socket.emit('participant:drift', { roomCode: this.currentRoom.code, driftMs });
  }
}

export const roomCoordinator = new RoomCoordinator();
