import { joinRoom } from 'trystero';
import type { RoomState, Participant, Track, PlaybackState } from '../types.js';
import { socket } from './socket.js';

type StateListener = (room: RoomState) => void;
type PlaybackListener = (playback: PlaybackState) => void;

class RoomCoordinator {
  private currentRoom: RoomState | null = null;
  private trysteroRoom: any = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private selfId: string;
  private username: string;

  private stateListeners = new Set<StateListener>();
  private playbackListeners = new Set<PlaybackListener>();

  // Trystero action handlers
  private sendRoomState: ((data: RoomState, peerId?: string) => void) | null = null;
  private sendPlaybackSync: ((data: PlaybackState, peerId?: string) => void) | null = null;
  private sendStateRequest: ((data: { from: string }, peerId?: string) => void) | null = null;
  private sendDrift: ((data: { peerId: string; driftMs: number }) => void) | null = null;

  constructor() {
    this.selfId = 'p_' + Math.random().toString(36).slice(2, 9);
    this.username = typeof window !== 'undefined'
      ? localStorage.getItem('vybe_username') || `User_${this.selfId.slice(2, 6)}`
      : 'Guest';

    this.setupSocketBridge();
  }

  public getSelfId(): string {
    return this.selfId;
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

  /**
   * Connects to Trystero WebRTC mesh and local BroadcastChannel for zero-backend communication.
   */
  private setupP2PRoom(roomCode: string, isHost: boolean): void {
    this.leaveP2PRoom();

    try {
      // 1. Same-device tab sync via BroadcastChannel
      this.broadcastChannel = new BroadcastChannel(`vybe_room_${roomCode}`);
      this.broadcastChannel.onmessage = (event) => {
        const { type, payload, sender } = event.data || {};
        if (sender === this.selfId) return;

        if (type === 'state') {
          this.handleIncomingState(payload);
        } else if (type === 'playback') {
          this.notifyPlayback(payload);
        } else if (type === 'request_state') {
          if (this.currentRoom && this.currentRoom.hostId === this.selfId) {
            this.broadcastChannel?.postMessage({
              type: 'state',
              payload: this.currentRoom,
              sender: this.selfId,
            });
          }
        }
      };

      // 2. Cross-device WebRTC mesh via Trystero
      this.trysteroRoom = joinRoom({ appId: 'vybe-sync-v2' }, roomCode);

      const [sendState, getState] = this.trysteroRoom.makeAction('state');
      const [sendPlayback, getPlayback] = this.trysteroRoom.makeAction('playback');
      const [sendReq, getReq] = this.trysteroRoom.makeAction('req_state');
      const [sendDriftReport, getDriftReport] = this.trysteroRoom.makeAction('drift');

      this.sendRoomState = sendState;
      this.sendPlaybackSync = sendPlayback;
      this.sendStateRequest = sendReq;
      this.sendDrift = sendDriftReport;

      // Handle receiving room state
      getState((state: RoomState, _peerId: string) => {
        this.handleIncomingState(state);
      });

      // Handle receiving playback changes (play, pause, seek, automix)
      getPlayback((playback: PlaybackState, _peerId: string) => {
        this.notifyPlayback(playback);
      });

      // Handle state requests from new joiners
      getReq((_req: { from: string }, peerId: string) => {
        if (this.currentRoom && (this.currentRoom.hostId === this.selfId || isHost)) {
          sendState(this.currentRoom, peerId);
        }
      });

      // Handle drift updates for participant dashboard
      getDriftReport((data: { peerId: string; driftMs: number }) => {
        if (!this.currentRoom) return;
        const updated = this.currentRoom.participants.map((p) =>
          p.id === data.peerId ? { ...p, driftMs: data.driftMs } : p
        );
        this.notifyState({ ...this.currentRoom, participants: updated });
      });

      // When a new peer joins the room
      this.trysteroRoom.onPeerJoin((peerId: string) => {
        if (!this.currentRoom) return;

        // If I am the host, send them the current state immediately!
        if (this.currentRoom.hostId === this.selfId) {
          sendState(this.currentRoom, peerId);
        }

        // Add peer to participants if not present
        const exists = this.currentRoom.participants.some((p) => p.id === peerId);
        if (!exists) {
          const newParticipant: Participant = {
            id: peerId,
            username: `Guest_${peerId.slice(0, 4)}`,
            isHost: false,
            driftMs: 0,
            joinedAt: Date.now(),
          };
          this.notifyState({
            ...this.currentRoom,
            participants: [...this.currentRoom.participants, newParticipant],
          });
        }
      });

      // When a peer leaves
      this.trysteroRoom.onPeerLeave((peerId: string) => {
        if (!this.currentRoom) return;
        const filtered = this.currentRoom.participants.filter((p) => p.id !== peerId);
        let hostId = this.currentRoom.hostId;
        if (hostId === peerId && filtered.length > 0) {
          filtered[0].isHost = true;
          hostId = filtered[0].id;
        }
        this.notifyState({ ...this.currentRoom, participants: filtered, hostId });
      });

      // If joining as peer, broadcast request for current state
      if (!isHost) {
        sendReq({ from: this.selfId });
        this.broadcastChannel.postMessage({
          type: 'request_state',
          payload: { from: this.selfId },
          sender: this.selfId,
        });
      }
    } catch (err) {
      console.warn('[RoomCoordinator] P2P mesh setup error:', err);
    }
  }

  private handleIncomingState(state: RoomState): void {
    if (!state || !state.code) return;
    this.currentRoom = state;
    this.notifyState(state);
    this.notifyPlayback(state.playback);
  }

  private leaveP2PRoom(): void {
    if (this.trysteroRoom) {
      try {
        this.trysteroRoom.leave();
      } catch {}
      this.trysteroRoom = null;
    }
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {}
      this.broadcastChannel = null;
    }
  }

  // Socket.IO Bridge (if backend server is reachable)
  private setupSocketBridge(): void {
    socket.on('room:state', (state: RoomState) => {
      this.handleIncomingState(state);
    });

    socket.on('playback:sync', (playback: PlaybackState) => {
      this.notifyPlayback(playback);
    });

    socket.on('room:joined', (data: { room: RoomState }) => {
      if (data?.room) {
        this.handleIncomingState(data.room);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Public Room Actions (Autonomous, Zero Delay)
  // -------------------------------------------------------------------------

  public createRoom(username?: string): RoomState {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const name = username?.trim() || this.username;
    this.username = name;
    localStorage.setItem('vybe_username', name);

    const host: Participant = {
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
      participants: [host],
    };

    this.setupP2PRoom(code, true);
    this.notifyState(room);

    if (socket.connected) {
      socket.emit('room:create', { username: name });
    }

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

    this.setupP2PRoom(code, false);
    this.notifyState(placeholderRoom);

    if (socket.connected) {
      socket.emit('room:join', { roomCode: code, username: name });
    }

    return placeholderRoom;
  }

  public leaveRoom(): void {
    this.leaveP2PRoom();
    this.currentRoom = null;
  }

  public togglePlayPause(currentPosition: number): void {
    if (!this.currentRoom) return;

    const isPlaying = this.currentRoom.playback.status === 'playing';
    const track = this.currentRoom.playback.currentTrack || this.currentRoom.queue[this.currentRoom.queueIndex];
    if (!track) return;

    const now = Date.now();
    let newPlayback: PlaybackState;

    if (isPlaying) {
      newPlayback = {
        status: 'paused',
        currentTrack: track,
        position: currentPosition,
        serverTimestamp: now,
        scheduledStartTime: null,
        playbackRate: 1.0,
      };
    } else {
      newPlayback = {
        status: 'playing',
        currentTrack: track,
        position: currentPosition,
        serverTimestamp: now,
        scheduledStartTime: now + 400,
        playbackRate: 1.0,
      };
    }

    this.broadcastPlayback(newPlayback);
    if (socket.connected) {
      socket.emit(isPlaying ? 'playback:pause' : 'playback:play', {
        roomCode: this.currentRoom.code,
        position: currentPosition,
      });
    }
  }

  public seek(positionSec: number): void {
    if (!this.currentRoom || !this.currentRoom.playback.currentTrack) return;

    const isPlaying = this.currentRoom.playback.status === 'playing';
    const now = Date.now();

    const newPlayback: PlaybackState = {
      status: this.currentRoom.playback.status,
      currentTrack: this.currentRoom.playback.currentTrack,
      position: Math.max(0, positionSec),
      serverTimestamp: now,
      scheduledStartTime: isPlaying ? now + 400 : null,
      playbackRate: 1.0,
    };

    this.broadcastPlayback(newPlayback);
    if (socket.connected) {
      socket.emit('playback:seek', {
        roomCode: this.currentRoom.code,
        position: positionSec,
      });
    }
  }

  public addToQueue(track: Track): void {
    if (!this.currentRoom) return;

    const updatedQueue = [...this.currentRoom.queue, track];
    const isFirstTrack = !this.currentRoom.playback.currentTrack || this.currentRoom.playback.status === 'stopped';

    let updatedPlayback = this.currentRoom.playback;
    let queueIndex = this.currentRoom.queueIndex;

    if (isFirstTrack) {
      queueIndex = updatedQueue.length - 1;
      const now = Date.now();
      updatedPlayback = {
        status: 'playing',
        currentTrack: track,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + 400,
        playbackRate: 1.0,
      };
    }

    const updatedRoom: RoomState = {
      ...this.currentRoom,
      queue: updatedQueue,
      queueIndex,
      playback: updatedPlayback,
    };

    this.broadcastState(updatedRoom);
    if (isFirstTrack) {
      this.broadcastPlayback(updatedPlayback);
    }

    if (socket.connected) {
      socket.emit('queue:add', { roomCode: this.currentRoom.code, track });
    }
  }

  public removeFromQueue(trackId: string): void {
    if (!this.currentRoom) return;

    const updatedQueue = this.currentRoom.queue.filter((t) => t.id !== trackId);
    let queueIndex = this.currentRoom.queueIndex;
    if (queueIndex >= updatedQueue.length) {
      queueIndex = Math.max(0, updatedQueue.length - 1);
    }

    const updatedRoom: RoomState = {
      ...this.currentRoom,
      queue: updatedQueue,
      queueIndex,
    };

    this.broadcastState(updatedRoom);
    if (socket.connected) {
      socket.emit('queue:remove', { roomCode: this.currentRoom.code, trackId });
    }
  }

  public skipNext(): void {
    if (!this.currentRoom || this.currentRoom.queue.length === 0) return;

    const nextIdx = (this.currentRoom.queueIndex + 1) % this.currentRoom.queue.length;
    const nextTrack = this.currentRoom.queue[nextIdx];
    const now = Date.now();

    const newPlayback: PlaybackState = {
      status: 'playing',
      currentTrack: nextTrack,
      position: 0,
      serverTimestamp: now,
      scheduledStartTime: now + 400,
      playbackRate: 1.0,
    };

    const updatedRoom: RoomState = {
      ...this.currentRoom,
      queueIndex: nextIdx,
      playback: newPlayback,
    };

    this.broadcastState(updatedRoom);
    this.broadcastPlayback(newPlayback);

    if (socket.connected) {
      socket.emit('queue:skip', { roomCode: this.currentRoom.code, index: nextIdx });
    }
  }

  public reportDrift(driftMs: number): void {
    if (!this.currentRoom) return;
    this.sendDrift?.({ peerId: this.selfId, driftMs });
    if (socket.connected) {
      socket.emit('participant:drift', { roomCode: this.currentRoom.code, driftMs });
    }
  }

  private broadcastPlayback(playback: PlaybackState): void {
    this.notifyPlayback(playback);
    this.sendPlaybackSync?.(playback);
    this.broadcastChannel?.postMessage({
      type: 'playback',
      payload: playback,
      sender: this.selfId,
    });
  }

  private broadcastState(room: RoomState): void {
    this.notifyState(room);
    this.sendRoomState?.(room);
    this.broadcastChannel?.postMessage({
      type: 'state',
      payload: room,
      sender: this.selfId,
    });
  }
}

export const roomCoordinator = new RoomCoordinator();
