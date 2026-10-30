import type {
  MediaItem,
  MediaItemInput,
  PlaybackState,
  RoomState,
  RoomUser,
} from '../types.js';

const STORAGE_KEY_PREFIX = 'vybe_virtual_room_';

class VirtualRoomEngine {
  private activeRoomCode: string | null = null;
  private currentUserId: string = 'usr_' + Math.random().toString(36).slice(2, 9);
  private sessionToken: string = 'tok_' + Math.random().toString(36).slice(2, 11);
  private channel: BroadcastChannel | null = null;
  private eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('vybe_sync_channel');
        this.channel.onmessage = (event) => {
          this.handleBroadcastMessage(event.data);
        };
      } catch {
        this.channel = null;
      }
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
    if (this.channel) {
      try {
        this.channel.postMessage({ type, payload, roomCode: this.activeRoomCode });
      } catch {
        // Broadcast failed
      }
    }
  }

  private handleBroadcastMessage(data: { type: string; payload: unknown; roomCode: string | null }): void {
    if (!data || !data.roomCode || data.roomCode !== this.activeRoomCode) return;

    if (data.type === 'sync_state' && data.payload) {
      const state = data.payload as RoomState;
      this.saveRoom(state);
      this.emit('room:state', state);
      this.emit('playback:sync', state.playback);
      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
    }
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
      const roomCode = String(Math.floor(100000 + Math.random() * 900000));
      this.activeRoomCode = roomCode;

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

      this.saveRoom(state);
      setTimeout(() => {
        this.emit('room:created', {
          roomCode,
          user,
          state,
          sessionToken: this.sessionToken,
        });
      }, 30);
      return true;
    }

    if (event === 'room:join') {
      const roomCode = (payload.roomCode as string) || '';
      const username = (payload.username as string) || 'Guest';
      this.activeRoomCode = roomCode;

      let state = this.getStoredRoom(roomCode);
      let isAdmin = false;

      if (!state) {
        // Auto-create if doesn't exist
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
          adminId: user.id,
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
      } else {
        const existingUser = state.users.find((u) => u.id === this.currentUserId);
        if (existingUser) {
          existingUser.username = username;
          existingUser.isOnline = true;
          isAdmin = existingUser.isAdmin;
        } else {
          state.users.push({
            id: this.currentUserId,
            username,
            isAdmin: false,
            isOnline: true,
            ping: 2,
            drift: 0,
          });
        }
      }

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
        this.broadcast('sync_state', state);
      }, 30);
      return true;
    }

    if (event === 'room:resume') {
      const roomCode = (payload.roomCode as string) || '';
      const username = (payload.username as string) || 'Guest';
      this.activeRoomCode = roomCode;
      const state = this.getStoredRoom(roomCode);

      if (state) {
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
        }, 30);
        return true;
      }
    }

    if (event === 'queue:play_now') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      const itemInput = payload.item as MediaItemInput;
      if (!roomCode || !itemInput) return true;

      const state = this.getStoredRoom(roomCode);
      if (!state) return true;

      const mediaItem: MediaItem = {
        ...itemInput,
        id: 'track_' + Math.random().toString(36).slice(2, 9),
        addedBy: 'You',
        addedAt: now,
      };

      state.queue.push(mediaItem);
      state.currentIndex = state.queue.length - 1;
      state.playback = {
        status: 'playing',
        currentTrack: mediaItem,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + 200,
        playbackRate: 1,
        version: now,
      };
      state.version = now;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:play_index') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      const index = typeof payload.index === 'number' ? payload.index : 0;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode);
      if (!state || !state.queue[index]) return true;

      state.currentIndex = index;
      state.playback = {
        status: 'playing',
        currentTrack: state.queue[index],
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + 200,
        playbackRate: 1,
        version: now,
      };
      state.version = now;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'queue:add') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      const itemInput = payload.item as MediaItemInput;
      if (!roomCode || !itemInput) return true;

      const state = this.getStoredRoom(roomCode);
      if (!state) return true;

      const mediaItem: MediaItem = {
        ...itemInput,
        id: 'track_' + Math.random().toString(36).slice(2, 9),
        addedBy: 'You',
        addedAt: now,
      };

      state.queue.push(mediaItem);

      // If playback is currently stopped and queue was empty, start playing it
      if (state.playback.status === 'stopped' || !state.playback.currentTrack) {
        state.currentIndex = 0;
        state.playback = {
          status: 'playing',
          currentTrack: mediaItem,
          position: 0,
          serverTimestamp: now,
          scheduledStartTime: now + 300,
          playbackRate: 1,
          version: now,
        };
      }

      state.version = now;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'queue:remove') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      const itemId = payload.itemId as string;
      if (!roomCode || !itemId) return true;

      const state = this.getStoredRoom(roomCode);
      if (!state) return true;

      state.queue = state.queue.filter((item) => item.id !== itemId);
      state.version = now;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'queue:clear') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode);
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
      this.saveRoom(state);

      this.emit('queue:updated', { queue: [], currentIndex: 0 });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:play') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode);
      if (!state || !state.playback.currentTrack) return true;

      state.playback.status = 'playing';
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = now + 250;
      state.version = now;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:pause') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode);
      if (!state) return true;

      state.playback.status = 'paused';
      state.playback.position = typeof payload.position === 'number' ? payload.position : state.playback.position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = null;
      state.version = now;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:seek') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode);
      if (!state) return true;

      const position = typeof payload.position === 'number' ? payload.position : 0;
      state.playback.position = position;
      state.playback.serverTimestamp = now;
      state.playback.scheduledStartTime = now + 200;
      state.version = now;
      this.saveRoom(state);

      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'playback:skip') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode);
      if (!state || state.queue.length === 0) return true;

      const direction = (payload.direction as string) || 'next';
      if (direction === 'next') {
        state.currentIndex = (state.currentIndex + 1) % state.queue.length;
      } else {
        state.currentIndex = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
      }

      state.playback = {
        status: 'playing',
        currentTrack: state.queue[state.currentIndex] || null,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + 300,
        playbackRate: 1,
        version: now,
      };
      state.version = now;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'track:ended') {
      const roomCode = (payload.roomCode as string) || this.activeRoomCode;
      if (!roomCode) return true;

      const state = this.getStoredRoom(roomCode);
      if (!state || state.queue.length === 0) return true;

      // Next track in queue
      state.currentIndex = (state.currentIndex + 1) % state.queue.length;
      state.playback = {
        status: 'playing',
        currentTrack: state.queue[state.currentIndex] || null,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + 200,
        playbackRate: 1,
        version: now,
      };
      state.version = now;
      this.saveRoom(state);

      this.emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
      this.emit('playback:sync', state.playback);
      this.broadcast('sync_state', state);
      return true;
    }

    if (event === 'room:leave' || event === 'room:end') {
      this.activeRoomCode = null;
      return true;
    }

    return false;
  }
}

export const virtualRoomEngine = new VirtualRoomEngine();
