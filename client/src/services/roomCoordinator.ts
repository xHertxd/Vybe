import { joinRoom } from 'trystero';
import type { RoomState, Participant, Track, PlaybackState } from '../types.js';
import { socket } from './socket.js';
import { audioEngine } from './audioEngine.js';

type StateListener = (room: RoomState) => void;
type PlaybackListener = (playback: PlaybackState) => void;

interface JoinHelloPayload {
  id: string;
  username: string;
}

interface ClockPingPayload {
  t0: number;
}

interface ClockPongPayload {
  t0: number;
  t1: number;
}

class RoomCoordinator {
  private currentRoom: RoomState | null = null;
  private trysteroRoom: any = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private selfId: string;
  private username: string;
  private peerClockOffset = 0;

  private stateListeners = new Set<StateListener>();
  private playbackListeners = new Set<PlaybackListener>();

  // State sync retry & heartbeat timers
  private syncRetryTimer: ReturnType<typeof setInterval> | null = null;
  private hostHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private joinTimeout: ReturnType<typeof setTimeout> | null = null;
  private hasReceivedInitialState = false;

  // Trystero action transmitters
  private sendHello: ((data: JoinHelloPayload, peerId?: string) => void) | null = null;
  private sendRoomState: ((data: RoomState, peerId?: string) => void) | null = null;
  private sendPlaybackSync: ((data: PlaybackState, peerId?: string) => void) | null = null;
  private sendDrift: ((data: { peerId: string; driftMs: number }) => void) | null = null;
  private sendClockPing: ((data: ClockPingPayload, peerId?: string) => void) | null = null;
  private sendClockPong: ((data: ClockPongPayload, peerId?: string) => void) | null = null;
  private sendKick: ((data: { targetId: string }, peerId?: string) => void) | null = null;

  constructor() {
    this.selfId = 'p_' + Math.random().toString(36).slice(2, 9);
    this.username = typeof window !== 'undefined'
      ? localStorage.getItem('vybe_username') || `Guest_${this.selfId.slice(2, 6)}`
      : 'Guest';

    // Link audio engine to our peer clock offset provider
    audioEngine.setClockProvider(() => Date.now() + this.peerClockOffset);
    this.setupSocketBridge();
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

  /**
   * Sets up multi-layer peer-to-peer mesh:
   * 1. BroadcastChannel (0ms tab sync)
   * 2. Trystero WebRTC mesh (cross-device serverless sync with clock ping-pong)
   */
  private setupP2PRoom(roomCode: string, isHost: boolean): void {
    this.cleanupMesh();
    this.hasReceivedInitialState = isHost;
    this.peerClockOffset = 0;

    try {
      // 1. Same-device tab sync via BroadcastChannel
      this.broadcastChannel = new BroadcastChannel(`vybe_room_${roomCode}`);
      this.broadcastChannel.onmessage = (event) => {
        const { type, payload, sender } = event.data || {};
        if (sender === this.selfId) return;

        if (type === 'hello') {
          if (this.currentRoom && this.currentRoom.hostId === this.selfId) {
            this.handleParticipantJoined(payload.id, payload.username);
            this.broadcastChannel?.postMessage({
              type: 'state',
              payload: this.currentRoom,
              sender: this.selfId,
            });
          }
        } else if (type === 'state') {
          this.handleIncomingState(payload);
        } else if (type === 'playback') {
          this.notifyPlayback(payload);
        } else if (type === 'kick') {
          if (payload?.targetId === this.selfId) {
            this.handleWasKicked();
          }
        }
      };

      // 2. Cross-device WebRTC mesh via Trystero with Google and Cloudflare STUN servers
      this.trysteroRoom = joinRoom(
        {
          appId: 'vybe-sync-v2',
          rtcConfig: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun.cloudflare.com:3478' },
            ],
          },
        },
        roomCode
      );

      const [sendHello, getHello] = this.trysteroRoom.makeAction('hello');
      const [sendState, getState] = this.trysteroRoom.makeAction('state');
      const [sendPlayback, getPlayback] = this.trysteroRoom.makeAction('playback');
      const [sendDriftReport, getDriftReport] = this.trysteroRoom.makeAction('drift');
      const [sendClockPing, getClockPing] = this.trysteroRoom.makeAction('clock_ping');
      const [sendClockPong, getClockPong] = this.trysteroRoom.makeAction('clock_pong');
      const [sendKick, getKick] = this.trysteroRoom.makeAction('kick');

      this.sendHello = sendHello;
      this.sendRoomState = sendState;
      this.sendPlaybackSync = sendPlayback;
      this.sendDrift = sendDriftReport;
      this.sendClockPing = sendClockPing;
      this.sendClockPong = sendClockPong;
      this.sendKick = sendKick;

      const getFreshHostState = (): RoomState | null => {
        if (!this.currentRoom) return null;
        const freshPos = audioEngine.getCurrentPosition();
        const now = Date.now();
        return {
          ...this.currentRoom,
          playback: {
            ...this.currentRoom.playback,
            position: freshPos,
            serverTimestamp: now,
            scheduledStartTime: this.currentRoom.playback.status === 'playing' ? now : null,
          },
        };
      };

      // Handle receiving join hello handshake
      getHello((data: JoinHelloPayload, peerId: string) => {
        if (!this.currentRoom) return;

        if (this.currentRoom.hostId === this.selfId || isHost) {
          this.handleParticipantJoined(data.id || peerId, data.username);
          const fresh = getFreshHostState() || this.currentRoom;
          sendState(fresh, peerId);
        }
      });

      // Handle receiving room state
      getState((state: RoomState, _peerId: string) => {
        this.handleIncomingState(state);
      });

      // Handle receiving playback updates
      getPlayback((playback: PlaybackState, _peerId: string) => {
        this.notifyPlayback(playback);
      });

      // Handle receiving drift updates
      getDriftReport((data: { peerId: string; driftMs: number }) => {
        if (!this.currentRoom) return;
        const updated = this.currentRoom.participants.map((p) =>
          p.id === data.peerId ? { ...p, driftMs: data.driftMs } : p
        );
        this.notifyState({ ...this.currentRoom, participants: updated });
      });

      // Handle clock ping (responder returns their timestamp)
      getClockPing((data: ClockPingPayload, peerId: string) => {
        sendClockPong({ t0: data.t0, t1: Date.now() }, peerId);
      });

      // Handle clock pong (calculate clock offset relative to host)
      getClockPong((data: ClockPongPayload) => {
        const now = Date.now();
        const rtt = Math.max(0, now - data.t0);
        this.peerClockOffset = Math.round(data.t1 + rtt / 2 - now);
      });

      // Handle kick action
      getKick((data: { targetId: string }) => {
        if (data.targetId === this.selfId) {
          this.handleWasKicked();
        }
      });

      // When a new WebRTC peer connects
      this.trysteroRoom.onPeerJoin((peerId: string) => {
        if (!this.currentRoom) return;

        if (this.currentRoom.hostId === this.selfId || isHost) {
          const fresh = getFreshHostState() || this.currentRoom;
          sendState(fresh, peerId);
        } else {
          sendHello({ id: this.selfId, username: this.username }, peerId);
          sendClockPing({ t0: Date.now() }, peerId);
        }
      });

      // When a peer disconnects
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

      // 3. For Joiner: Continuous handshake & clock ping retry until state is received
      if (!isHost) {
        const sendJoinHandshake = () => {
          if (this.hasReceivedInitialState) {
            if (this.syncRetryTimer) {
              clearInterval(this.syncRetryTimer);
              this.syncRetryTimer = null;
            }
            return;
          }

          const payload: JoinHelloPayload = { id: this.selfId, username: this.username };
          this.sendHello?.(payload);
          this.sendClockPing?.({ t0: Date.now() });
          this.broadcastChannel?.postMessage({
            type: 'hello',
            payload,
            sender: this.selfId,
          });
        };

        sendJoinHandshake();
        this.syncRetryTimer = setInterval(sendJoinHandshake, 800);
      } else {
        // 4. For Host: Heartbeat every 2.5s with live position snapshot
        this.hostHeartbeatTimer = setInterval(() => {
          if (this.currentRoom && this.currentRoom.hostId === this.selfId && this.currentRoom.playback.status === 'playing') {
            const livePos = audioEngine.getCurrentPosition();
            const now = Date.now();
            const livePlayback: PlaybackState = {
              ...this.currentRoom.playback,
              position: livePos,
              serverTimestamp: now,
              scheduledStartTime: now,
              playbackRate: 1.0,
            };
            this.currentRoom.playback = livePlayback;
            this.sendPlaybackSync?.(livePlayback);
            this.broadcastChannel?.postMessage({
              type: 'playback',
              payload: livePlayback,
              sender: this.selfId,
            });
          }
        }, 2500);
      }
    } catch (err) {
      console.warn('[RoomCoordinator] Mesh setup error:', err);
    }
  }

  private handleWasKicked(): void {
    alert('You have been removed from the room by the host.');
    this.leaveRoom();
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/');
      window.location.href = '/';
    }
  }

  private handleParticipantJoined(id: string, username: string): void {
    if (!this.currentRoom) return;

    const existingIdx = this.currentRoom.participants.findIndex((p) => p.id === id);
    const updatedParticipants = [...this.currentRoom.participants];

    if (existingIdx !== -1) {
      updatedParticipants[existingIdx].username = username;
    } else {
      updatedParticipants.push({
        id,
        username,
        isHost: false,
        driftMs: 0,
        joinedAt: Date.now(),
      });
    }

    const freshPos = audioEngine.getCurrentPosition();
    const now = Date.now();
    const isPlaying = this.currentRoom.playback.status === 'playing';

    const updatedRoom: RoomState = {
      ...this.currentRoom,
      participants: updatedParticipants,
      playback: {
        ...this.currentRoom.playback,
        position: freshPos,
        serverTimestamp: now,
        scheduledStartTime: isPlaying ? now : null,
      },
    };

    this.notifyState(updatedRoom);
    this.sendRoomState?.(updatedRoom);
    this.broadcastChannel?.postMessage({
      type: 'state',
      payload: updatedRoom,
      sender: this.selfId,
    });
  }

  private handleIncomingState(state: RoomState): void {
    if (!state || !state.code) return;

    // 1. Host Protection:
    // If I am currently the active host with an active queue,
    // NEVER allow an incoming empty room state to overwrite my active room!
    if (this.currentRoom && this.currentRoom.hostId === this.selfId) {
      const myHasTracks = this.currentRoom.queue.length > 0 || Boolean(this.currentRoom.playback.currentTrack);
      const incomingHasTracks = (state.queue && state.queue.length > 0) || Boolean(state.playback?.currentTrack);

      if (myHasTracks && !incomingHasTracks) {
        // Assert our authority and re-broadcast our live state back so the joining peer syncs
        const freshPos = audioEngine.getCurrentPosition();
        const now = Date.now();
        const authoritativeRoom: RoomState = {
          ...this.currentRoom,
          playback: {
            ...this.currentRoom.playback,
            position: freshPos,
            serverTimestamp: now,
            scheduledStartTime: this.currentRoom.playback.status === 'playing' ? now : null,
          },
        };
        this.broadcastState(authoritativeRoom);
        return;
      }
    }

    this.hasReceivedInitialState = true;
    if (this.joinTimeout) {
      clearTimeout(this.joinTimeout);
      this.joinTimeout = null;
    }
    if (this.syncRetryTimer) {
      clearInterval(this.syncRetryTimer);
      this.syncRetryTimer = null;
    }

    // Merge self into participants if not present
    let updatedParticipants = state.participants || [];
    const selfExists = updatedParticipants.some((p) => p.id === this.selfId);
    if (!selfExists) {
      updatedParticipants = [
        ...updatedParticipants,
        {
          id: this.selfId,
          username: this.username,
          isHost: state.hostId === this.selfId,
          driftMs: 0,
          joinedAt: Date.now(),
        },
      ];
    }

    const mergedState: RoomState = {
      ...state,
      participants: updatedParticipants,
    };

    this.currentRoom = mergedState;
    this.notifyState(mergedState);
    if (state.playback) {
      this.notifyPlayback(state.playback);
    }
  }

  private cleanupMesh(): void {
    if (this.joinTimeout) {
      clearTimeout(this.joinTimeout);
      this.joinTimeout = null;
    }
    if (this.syncRetryTimer) {
      clearInterval(this.syncRetryTimer);
      this.syncRetryTimer = null;
    }
    if (this.hostHeartbeatTimer) {
      clearInterval(this.hostHeartbeatTimer);
      this.hostHeartbeatTimer = null;
    }
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
        if (this.joinTimeout) {
          clearTimeout(this.joinTimeout);
          this.joinTimeout = null;
        }
        this.handleIncomingState(data.room);
      }
    });

    socket.on('room:kicked', () => {
      this.handleWasKicked();
    });
  }

  // -------------------------------------------------------------------------
  // Public Room Actions
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
      socket.emit('room:create', { roomCode: code, username: name });
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

    // If no existing host responds after 5 seconds, assume host role
    // This allows typing/opening any 6-digit code to create the room if it doesn't exist,
    // while giving plenty of time to receive the real host's songs and queue!
    if (this.joinTimeout) clearTimeout(this.joinTimeout);
    this.joinTimeout = setTimeout(() => {
      if (
        !this.hasReceivedInitialState &&
        this.currentRoom &&
        this.currentRoom.code === code &&
        (!this.currentRoom.hostId || this.currentRoom.hostId === '')
      ) {
        const claimedRoom: RoomState = {
          ...this.currentRoom,
          hostId: this.selfId,
          participants: this.currentRoom.participants.map((p) =>
            p.id === this.selfId ? { ...p, isHost: true } : p
          ),
        };
        this.notifyState(claimedRoom);
        // Do NOT broadcast an empty state across channels, so we never clobber active peers!
      }
    }, 5000);

    if (socket.connected) {
      socket.emit('room:join', { roomCode: code, username: name });
    }

    return placeholderRoom;
  }

  public leaveRoom(): void {
    this.cleanupMesh();
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
        scheduledStartTime: now + 300,
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
      scheduledStartTime: isPlaying ? now + 300 : null,
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
        scheduledStartTime: now + 300,
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

  public addMultipleToQueue(tracks: Track[]): void {
    if (!this.currentRoom || tracks.length === 0) return;

    const updatedQueue = [...this.currentRoom.queue, ...tracks];
    const isFirstTrack = !this.currentRoom.playback.currentTrack || this.currentRoom.playback.status === 'stopped';

    let updatedPlayback = this.currentRoom.playback;
    let queueIndex = this.currentRoom.queueIndex;

    if (isFirstTrack) {
      queueIndex = this.currentRoom.queue.length;
      const now = Date.now();
      updatedPlayback = {
        status: 'playing',
        currentTrack: tracks[0],
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + 300,
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
      socket.emit('queue:add_multiple', { roomCode: this.currentRoom.code, tracks });
    }
  }

  public reorderQueue(fromIndex: number, toIndex: number): void {
    if (!this.currentRoom) return;
    const { queue } = this.currentRoom;
    if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) return;

    const updated = [...queue];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    // Keep current playing item synchronized with index
    let newQueueIndex = this.currentRoom.queueIndex;
    if (this.currentRoom.queueIndex === fromIndex) {
      newQueueIndex = toIndex;
    } else if (fromIndex < this.currentRoom.queueIndex && toIndex >= this.currentRoom.queueIndex) {
      newQueueIndex -= 1;
    } else if (fromIndex > this.currentRoom.queueIndex && toIndex <= this.currentRoom.queueIndex) {
      newQueueIndex += 1;
    }

    const updatedRoom: RoomState = {
      ...this.currentRoom,
      queue: updated,
      queueIndex: newQueueIndex,
    };

    this.broadcastState(updatedRoom);

    if (socket.connected) {
      socket.emit('queue:reorder', { roomCode: this.currentRoom.code, fromIndex, toIndex });
    }
  }

  public transferAdmin(newHostId: string): void {
    if (!this.currentRoom) return;

    const updatedParticipants = this.currentRoom.participants.map((p) => ({
      ...p,
      isHost: p.id === newHostId,
    }));

    const updatedRoom: RoomState = {
      ...this.currentRoom,
      hostId: newHostId,
      participants: updatedParticipants,
    };

    this.broadcastState(updatedRoom);

    if (socket.connected) {
      socket.emit('room:transfer_host', { roomCode: this.currentRoom.code, newHostId });
    }
  }

  public kickParticipant(targetUserId: string): void {
    if (!this.currentRoom) return;

    this.sendKick?.({ targetId: targetUserId });
    this.broadcastChannel?.postMessage({
      type: 'kick',
      payload: { targetId: targetUserId },
      sender: this.selfId,
    });

    const filtered = this.currentRoom.participants.filter((p) => p.id !== targetUserId);
    const updatedRoom: RoomState = {
      ...this.currentRoom,
      participants: filtered,
    };

    this.broadcastState(updatedRoom);

    if (socket.connected) {
      socket.emit('room:kick', { roomCode: this.currentRoom.code, targetUserId });
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
      scheduledStartTime: now + 300,
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
