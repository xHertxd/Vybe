import { joinRoom, type Room } from 'trystero';
import type {
  MediaItem,
  MediaItemInput,
  PlaybackState,
  RoomSettings,
  RoomState,
  RoomUser,
} from '../types.js';

const STORAGE_KEY_PREFIX = 'vybe_virtual_room_';

class VirtualRoomEngine {
  private activeRoomCode: string | null = null;
  private currentUserId: string = (() => {
    try {
      const saved = localStorage.getItem('vybe_persistent_user_id');
      if (saved) return saved;
      const created = 'usr_' + Math.random().toString(36).slice(2, 9);
      localStorage.setItem('vybe_persistent_user_id', created);
      return created;
    } catch {
      return 'usr_' + Math.random().toString(36).slice(2, 9);
    }
  })();
  private currentUsername: string = 'Listener';
  private sessionToken: string = (() => {
    try {
      const saved = localStorage.getItem('vybe_persistent_session_token');
      if (saved) return saved;
      const created = 'tok_' + Math.random().toString(36).slice(2, 11);
      localStorage.setItem('vybe_persistent_session_token', created);
      return created;
    } catch {
      return 'tok_' + Math.random().toString(36).slice(2, 11);
    }
  })();
  private channel: BroadcastChannel | null = null;
  private eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>();
  private p2pRoom: Room | null = null;
  private p2pSendSync: ((data: unknown) => void) | null = null;
  private p2pSendRequest: ((data: unknown) => void) | null = null;
  private currentRoomState: RoomState | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      if ('BroadcastChannel' in window) {
        try {
          this.channel = new BroadcastChannel('vybe_sync_channel');
          this.channel.onmessage = (event) => {
            this.handleChannelMessage(event.data);
          };
        } catch {
          this.channel = null;
        }
      }

      // Storage event listener provides instant multi-tab sync on the same device
      window.addEventListener('storage', (e) => {
        if (this.activeRoomCode && e.key === STORAGE_KEY_PREFIX + this.activeRoomCode && e.newValue) {
          try {
            const state = JSON.parse(e.newValue) as RoomState;
            this.applyStateUpdate(state, false);
          } catch {
            // ignore malformed storage
          }
        }
      });
    }
  }

  public on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  public off(event: string, handler: (...args: unknown[]) => void): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  public emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          fn(...args);
        } catch (e) {
          console.error(`Error in virtual handler for ${event}`, e);
        }
      });
    }
  }

  private broadcast(type: string, payload: unknown): void {
    // 1. Same-device multi-tab BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage({ type, payload, roomCode: this.activeRoomCode, fromUser: this.currentUserId });
      } catch {
        // channel error
      }
    }

    // 2. Cross-device WebRTC P2P DataChannels
    if (type === 'sync_state' && this.p2pSendSync && payload) {
      try {
        this.p2pSendSync(payload);
      } catch {
        // p2p send error
      }
    } else if (type === 'request_state' && this.p2pSendRequest) {
      try {
        this.p2pSendRequest({ roomCode: this.activeRoomCode, fromUser: this.currentUserId });
      } catch {
        // p2p request error
      }
    }
  }

  private setupP2P(roomCode: string): void {
    if (typeof window === 'undefined') return;
    if (this.p2pRoom) {
      try {
        this.p2pRoom.leave();
      } catch {
        // ignore
      }
      this.p2pRoom = null;
      this.p2pSendSync = null;
      this.p2pSendRequest = null;
    }

    try {
      this.p2pRoom = joinRoom({ appId: 'vybe-hertx-sync-v1' }, `vybe_${roomCode}`);

      // Action for broadcasting & receiving authoritative room state
      const syncAction = this.p2pRoom.makeAction('sync_state', {
        onMessage: (remoteState: unknown) => {
          if (!remoteState) return;
          const state = remoteState as RoomState;
          if (!state.roomCode || state.roomCode !== this.activeRoomCode) return;
          this.applyStateUpdate(state, true);
        },
      });

      this.p2pSendSync = (data: unknown) => {
        void syncAction.send(data as any);
      };

      // Action for new peers requesting current room state from existing members
      const requestAction = this.p2pRoom.makeAction('request_state', {
        onMessage: (data: unknown) => {
          const req = data as { roomCode?: string; fromUser?: string };
          if (req?.roomCode === this.activeRoomCode && this.currentRoomState) {
            // Reply with current state
            this.broadcast('sync_state', this.currentRoomState);
          }
        },
      });

      this.p2pSendRequest = (data: unknown) => {
        void requestAction.send(data as any);
      };

      // When a new peer connects, existing members proactively send their room state
      this.p2pRoom.onPeerJoin = (peerId: string) => {
        console.log(`[P2P] Peer joined room ${roomCode}:`, peerId);
        if (this.currentRoomState) {
          setTimeout(() => {
            if (this.currentRoomState) {
              this.broadcast('sync_state', this.currentRoomState);
            }
          }, 300);
        }
      };

      // Request state from existing peers
      setTimeout(() => {
        this.broadcast('request_state', { roomCode, fromUser: this.currentUserId });
      }, 500);
    } catch (e) {
      console.warn('WebRTC P2P init error:', e);
    }
  }

  private handleChannelMessage(data: { type: string; payload: unknown; roomCode: string | null; fromUser?: string }): void {
    if (!data || !data.roomCode || data.roomCode !== this.activeRoomCode) return;
    if (data.fromUser === this.currentUserId) return; // Ignore own messages

    if (data.type === 'request_state') {
      if (this.currentRoomState) {
        this.broadcast('sync_state', this.currentRoomState);
      }
      return;
    }

    if (data.type === 'sync_state' && data.payload) {
      const state = data.payload as RoomState;
      this.applyStateUpdate(state, true);
    }
  }

  private applyStateUpdate(state: RoomState, persist = true): void {
    if (!state || state.roomCode !== this.activeRoomCode) return;

    // Merge current user into users list if not already present
    const hasMe = state.users.some((u) => u.id === this.currentUserId);
    if (!hasMe) {
      state.users.push({
        id: this.currentUserId,
        username: this.currentUsername,
        isAdmin: state.adminId === this.currentUserId,
        isOnline: true,
        ping: 2,
        drift: 0,
      });
    }

    this.currentRoomState = state;
    if (persist) {
      this.saveRoom(state);
    }

    this.emit('room:state', state);
    this.emit('playback:sync', state.playback);
    this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
  }

  private getStoredRoom(code: string): RoomState | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + code);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private saveRoom(state: RoomState): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + state.roomCode, JSON.stringify(state));
    } catch {
      // Storage full or unavailable
    }
  }

  public handleClientEmit(event: string, payload: Record<string, unknown> = {}): boolean {
    const now = Date.now();

    if (event === 'sync:ping') {
      const clientTime = Number(payload.clientTime) || now;
      setTimeout(() => {
        this.emit('sync:pong', { clientTime, serverTime: Date.now() });
      }, 5);
      return true;
    }

    if (event === 'room:create') {
      const username = (payload.username as string) || 'Listener';
      this.currentUsername = username;
      const roomCode = String(Math.floor(100000 + Math.random() * 900000));
      this.activeRoomCode = roomCode;
      this.setupP2P(roomCode);

      const user: RoomUser = {
        id: this.currentUserId,
        username,
        isAdmin: true,
        isOnline: true,
        ping: 2,
        drift: 0,
      };

      const playback: PlaybackState = {
        status: 'stopped',
        currentTrack: null,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: null,
        playbackRate: 1,
        version: now,
      };

      const state: RoomState = {
        roomCode,
        adminId: user.id,
        createdAt: now,
        playback,
        queue: [],
        currentIndex: 0,
        users: [user],
        settings: { repeatMode: 'all', isShuffle: false, sharedVolume: 100 },
        version: now,
      };

      this.currentRoomState = state;
      this.saveRoom(state);
      setTimeout(() => {
        this.emit('room:created', {
          roomCode,
          user,
          state,
          sessionToken: this.sessionToken,
        });
        this.broadcast('sync_state', state);
      }, 20);
      return true;
    }

    if (event === 'room:join') {
      const roomCode = (payload.roomCode as string) || '';
      const username = (payload.username as string) || 'Guest';
      this.currentUsername = username;
      this.activeRoomCode = roomCode;
      this.setupP2P(roomCode);

      // Check if room already exists locally or in memory
      let state = this.getStoredRoom(roomCode) || this.currentRoomState;
      let isAdmin = false;

      if (!state) {
        // If not found yet, create new room with this code and make user admin
        isAdmin = true;
        const user: RoomUser = {
          id: this.currentUserId,
          username,
          isAdmin: true,
          isOnline: true,
          ping: 2,
          drift: 0,
        };
        state = {
          roomCode,
          adminId: this.currentUserId,
          createdAt: now,
          playback: {
            status: 'stopped',
            currentTrack: null,
            position: 0,
            serverTimestamp: now,
            scheduledStartTime: null,
            playbackRate: 1,
            version: now,
          },
          queue: [],
          currentIndex: 0,
          users: [user],
          settings: { repeatMode: 'all', isShuffle: false, sharedVolume: 100 },
          version: now,
        };

        // Proactively ask any open tab or peer for the authoritative room state
        setTimeout(() => {
          this.broadcast('request_state', { roomCode, fromUser: this.currentUserId });
        }, 100);
      } else {
        isAdmin = state.adminId === this.currentUserId;
        const existingUser = state.users.find((u) => u.id === this.currentUserId);
        if (existingUser) {
          existingUser.username = username;
          existingUser.isOnline = true;
        } else {
          state.users.push({
            id: this.currentUserId,
            username,
            isAdmin,
            isOnline: true,
            ping: 2,
            drift: 0,
          });
        }
      }

      this.currentRoomState = state;
      const currentUser = state.users.find((u) => u.id === this.currentUserId)!;
      this.saveRoom(state);

      setTimeout(() => {
        this.emit('room:joined', {
          roomCode,
          user: currentUser,
          state,
          sessionToken: this.sessionToken,
          isNewRoom: isAdmin,
        });

        // Request authoritative state from host
        this.broadcast('request_state', { roomCode, fromUser: this.currentUserId });
      }, 20);
      return true;
    }

    if (event === 'room:resume') {
      const roomCode = (payload.roomCode as string) || '';
      const username = (payload.username as string) || 'Guest';
      this.currentUsername = username;
      this.activeRoomCode = roomCode;
      this.setupP2P(roomCode);
      const state = this.getStoredRoom(roomCode) || this.currentRoomState;

      if (state) {
        this.currentRoomState = state;
        const user = state.users.find((u) => u.id === this.currentUserId) || {
          id: this.currentUserId,
          username,
          isAdmin: state.adminId === this.currentUserId,
          isOnline: true,
          ping: 2,
          drift: 0,
        };
        setTimeout(() => {
          this.emit('room:joined', {
            roomCode,
            user,
            state,
            sessionToken: this.sessionToken,
            reconnected: true,
          });
        }, 20);
        return true;
      }
    }

    if (event === 'queue:play_now') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      const itemInput = payload.item as MediaItemInput;
      if (!roomCode || !itemInput) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const mediaItem: MediaItem = {
        ...itemInput,
        id: 'track_' + Math.random().toString(36).slice(2, 9),
        addedBy: this.currentUsername || 'You',
        addedAt: now,
      };

      state.queue.push(mediaItem);
      state.currentIndex = state.queue.length - 1;
      state.playback = {
        status: 'playing',
        currentTrack: mediaItem,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + 1000,
        playbackRate: 1,
        version: now,
      };
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:force_sync') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const currentTrack = state.playback.currentTrack;
      if (!currentTrack) return true;

      const isPlaying = state.playback.status === 'playing';
      const elapsed = isPlaying && state.playback.scheduledStartTime && now >= state.playback.scheduledStartTime
        ? (now - state.playback.scheduledStartTime) / 1000
        : 0;
      const position = Math.max(0, state.playback.position + elapsed);

      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = isPlaying ? now + 600 : null;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:play_index') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      const index = typeof payload.index === 'number' ? payload.index : 0;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state || !state.queue[index]) return true;

      state.currentIndex = index;
      state.playback = {
        status: 'playing',
        currentTrack: state.queue[index],
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + 1000,
        playbackRate: 1,
        version: now,
      };
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:force_sync') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const currentTrack = state.playback.currentTrack;
      if (!currentTrack) return true;

      const isPlaying = state.playback.status === 'playing';
      const elapsed = isPlaying && state.playback.scheduledStartTime && now >= state.playback.scheduledStartTime
        ? (now - state.playback.scheduledStartTime) / 1000
        : 0;
      const position = Math.max(0, state.playback.position + elapsed);

      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = isPlaying ? now + 600 : null;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'queue:add') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      const itemInput = payload.item as MediaItemInput;
      if (!roomCode || !itemInput) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const mediaItem: MediaItem = {
        ...itemInput,
        id: 'track_' + Math.random().toString(36).slice(2, 9),
        addedBy: this.currentUsername || 'You',
        addedAt: now,
      };

      state.queue.push(mediaItem);

      if (state.playback.status === 'stopped' || !state.playback.currentTrack) {
        state.currentIndex = 0;
        state.playback = {
          status: 'playing',
          currentTrack: mediaItem,
          position: 0,
          serverTimestamp: now,
          scheduledStartTime: now + 1000,
          playbackRate: 1,
          version: now,
        };
      }

      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:force_sync') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const currentTrack = state.playback.currentTrack;
      if (!currentTrack) return true;

      const isPlaying = state.playback.status === 'playing';
      const elapsed = isPlaying && state.playback.scheduledStartTime && now >= state.playback.scheduledStartTime
        ? (now - state.playback.scheduledStartTime) / 1000
        : 0;
      const position = Math.max(0, state.playback.position + elapsed);

      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = isPlaying ? now + 600 : null;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'queue:reorder') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      const fromIndex = typeof payload.fromIndex === 'number' ? payload.fromIndex : -1;
      const toIndex = typeof payload.toIndex === 'number' ? payload.toIndex : -1;
      if (!roomCode || fromIndex < 0 || toIndex < 0) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state || !state.queue[fromIndex] || !state.queue[toIndex]) return true;

      const [moved] = state.queue.splice(fromIndex, 1);
      state.queue.splice(toIndex, 0, moved);
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'queue:remove') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      const itemId = payload.itemId as string;
      if (!roomCode || !itemId) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      state.queue = state.queue.filter((item) => item.id !== itemId);
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'queue:clear') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      state.queue = [];
      state.currentIndex = 0;
      state.playback = {
        status: 'stopped',
        currentTrack: null,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: null,
        playbackRate: 1,
        version: now,
      };
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: [], currentIndex: 0 });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:force_sync') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const currentTrack = state.playback.currentTrack;
      if (!currentTrack) return true;

      const isPlaying = state.playback.status === 'playing';
      const elapsed = isPlaying && state.playback.scheduledStartTime && now >= state.playback.scheduledStartTime
        ? (now - state.playback.scheduledStartTime) / 1000
        : 0;
      const position = Math.max(0, state.playback.position + elapsed);

      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = isPlaying ? now + 600 : null;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:play') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state || !state.playback.currentTrack) return true;

      state.playback.status = 'playing';
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = now + 1000;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:force_sync') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const currentTrack = state.playback.currentTrack;
      if (!currentTrack) return true;

      const isPlaying = state.playback.status === 'playing';
      const elapsed = isPlaying && state.playback.scheduledStartTime && now >= state.playback.scheduledStartTime
        ? (now - state.playback.scheduledStartTime) / 1000
        : 0;
      const position = Math.max(0, state.playback.position + elapsed);

      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = isPlaying ? now + 600 : null;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:pause') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      state.playback.status = 'paused';
      state.playback.position = typeof payload.position === 'number' ? payload.position : state.playback.position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = null;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:force_sync') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const currentTrack = state.playback.currentTrack;
      if (!currentTrack) return true;

      const isPlaying = state.playback.status === 'playing';
      const elapsed = isPlaying && state.playback.scheduledStartTime && now >= state.playback.scheduledStartTime
        ? (now - state.playback.scheduledStartTime) / 1000
        : 0;
      const position = Math.max(0, state.playback.position + elapsed);

      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = isPlaying ? now + 600 : null;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:seek') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const position = typeof payload.position === 'number' ? payload.position : 0;
      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = now + 1000;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:force_sync') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const currentTrack = state.playback.currentTrack;
      if (!currentTrack) return true;

      const isPlaying = state.playback.status === 'playing';
      const elapsed = isPlaying && state.playback.scheduledStartTime && now >= state.playback.scheduledStartTime
        ? (now - state.playback.scheduledStartTime) / 1000
        : 0;
      const position = Math.max(0, state.playback.position + elapsed);

      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = isPlaying ? now + 600 : null;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:force_sync') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const currentTrack = state.playback.currentTrack;
      if (!currentTrack) return true;

      const isPlaying = state.playback.status === 'playing';
      const elapsed =
        isPlaying && state.playback.scheduledStartTime && now >= state.playback.scheduledStartTime
          ? (now - state.playback.scheduledStartTime) / 1000
          : 0;
      const position = Math.max(0, state.playback.position + elapsed);

      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = isPlaying ? now + 600 : null;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:next' || (event === 'playback:skip' && payload.direction === 'next')) {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state || state.queue.length === 0) return true;

      state.currentIndex = (state.currentIndex + 1) % state.queue.length;
      state.playback = {
        status: 'playing',
        currentTrack: state.queue[state.currentIndex] || null,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + 1000,
        playbackRate: 1,
        version: now,
      };
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:force_sync') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const currentTrack = state.playback.currentTrack;
      if (!currentTrack) return true;

      const isPlaying = state.playback.status === 'playing';
      const elapsed = isPlaying && state.playback.scheduledStartTime && now >= state.playback.scheduledStartTime
        ? (now - state.playback.scheduledStartTime) / 1000
        : 0;
      const position = Math.max(0, state.playback.position + elapsed);

      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = isPlaying ? now + 600 : null;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:prev' || (event === 'playback:skip' && payload.direction === 'prev')) {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state || state.queue.length === 0) return true;

      state.currentIndex = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
      state.playback = {
        status: 'playing',
        currentTrack: state.queue[state.currentIndex] || null,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + 1000,
        playbackRate: 1,
        version: now,
      };
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:force_sync') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const currentTrack = state.playback.currentTrack;
      if (!currentTrack) return true;

      const isPlaying = state.playback.status === 'playing';
      const elapsed = isPlaying && state.playback.scheduledStartTime && now >= state.playback.scheduledStartTime
        ? (now - state.playback.scheduledStartTime) / 1000
        : 0;
      const position = Math.max(0, state.playback.position + elapsed);

      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = isPlaying ? now + 600 : null;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'track:ended' || event === 'playback:track_ended') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state || state.queue.length === 0) return true;

      // Advance to next track in queue
      state.currentIndex = (state.currentIndex + 1) % state.queue.length;
      state.playback = {
        status: 'playing',
        currentTrack: state.queue[state.currentIndex] || null,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + 1000,
        playbackRate: 1,
        version: now,
      };
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:force_sync') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const currentTrack = state.playback.currentTrack;
      if (!currentTrack) return true;

      const isPlaying = state.playback.status === 'playing';
      const elapsed = isPlaying && state.playback.scheduledStartTime && now >= state.playback.scheduledStartTime
        ? (now - state.playback.scheduledStartTime) / 1000
        : 0;
      const position = Math.max(0, state.playback.position + elapsed);

      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = isPlaying ? now + 600 : null;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'settings:update') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      const settingsInput = payload.settings as Partial<RoomSettings>;
      if (!roomCode || !settingsInput) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      state.settings = { ...state.settings, ...settingsInput };
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      this.emit('room:state', state);
      this.broadcast('sync_state', state);
      return true;
    }

        if (event === 'room:claim_admin') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;
      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      state.adminId = this.currentUserId;
      state.users.forEach((u) => {
        u.isAdmin = u.id === this.currentUserId;
      });
      state.version = Date.now();
      this.currentRoomState = state;
      this.saveRoom(state);
      this.emit('room:state', state);
      this.broadcast('sync_state', state);
      return true;
    }

if (event === 'room:make_admin') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      const targetUserId = payload.targetUserId as string;
      if (!roomCode || !targetUserId) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      state.users.forEach((u) => {
        u.isAdmin = u.id === targetUserId;
      });
      state.adminId = targetUserId;
      state.version = now;
      this.currentRoomState = state;
      this.saveRoom(state);

      const newAdmin = state.users.find((u) => u.id === targetUserId);
      if (newAdmin) {
        this.emit('admin:changed', newAdmin);
      }
      this.emit('room:state', state);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'room:kick') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      const targetUserId = payload.targetUserId as string;
      if (!roomCode || !targetUserId) return true;

      const state = this.getStoredRoom(roomCode) || this.currentRoomState;
      if (!state) return true;

      const idx = state.users.findIndex((u) => u.id === targetUserId);
      if (idx !== -1) {
        state.users.splice(idx, 1);
        state.version = now;
        this.currentRoomState = state;
        this.saveRoom(state);

        this.emit('room:kicked', { targetUserId, reason: 'You were kicked from the room by the host.' });
        this.emit('room:state', state);
        this.broadcast('sync_state', state);
      }
      return true;
    }

    if (event === 'room:leave' || event === 'room:end') {
      if (this.p2pRoom) {
        try {
          this.p2pRoom.leave();
        } catch {
          // ignore
        }
        this.p2pRoom = null;
        this.p2pSendSync = null;
        this.p2pSendRequest = null;
      }
      this.activeRoomCode = null;
      this.currentRoomState = null;
      return true;
    }

    return false;
  }
}

export const virtualRoomEngine = new VirtualRoomEngine();
