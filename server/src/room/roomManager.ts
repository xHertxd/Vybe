import { RoomState, RoomUser, UnifiedMediaItem, PlaybackState, RoomSettings } from '../types.js';
import { PRESET_TRACKS } from '../media/mediaResolver.js';
import { SyncEngine } from '../sync/syncEngine.js';
import crypto from 'crypto';

interface ActiveRoomInternal {
  state: RoomState;
  disconnectTimers: Map<string, NodeJS.Timeout>;
  roomCloseTimer: NodeJS.Timeout | null;
}

export class RoomManager {
  private rooms: Map<string, ActiveRoomInternal> = new Map();

  // 25 seconds grace period for temporary network drops or page reloads
  private readonly DISCONNECT_GRACE_PERIOD_MS = 25000;

  /**
   * Generates a random, unique 6-digit numeric room code.
   */
  public generateUniqueRoomCode(): string {
    let attempts = 0;
    while (attempts < 1000) {
      // 100000 to 999999
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      if (!this.rooms.has(code)) {
        return code;
      }
      attempts++;
    }
    // Fallback if density is high
    return Math.floor(100000 + (Date.now() % 900000)).toString();
  }

  /**
   * Validates room code format (must be exactly 6 numeric digits).
   */
  public isValidRoomCode(code: string): boolean {
    return /^\d{6}$/.test(code);
  }

  /**
   * Validates username (alphabets only: A-Z, a-z).
   */
  public isValidUsername(username: string): boolean {
    return /^[a-zA-Z]+$/.test(username.trim());
  }

  /**
   * Checks if room exists and is active.
   */
  public roomExists(code: string): boolean {
    return this.rooms.has(code);
  }

  /**
   * Gets clean room state for clients.
   */
  public getRoomState(code: string): RoomState | null {
    const internal = this.rooms.get(code);
    if (!internal) return null;
    return internal.state;
  }

  /**
   * Creates a new room with default preset tracks and initial admin.
   */
  public createRoom(
    roomCode: string,
    creatorUsername: string,
    socketId: string,
    existingUserId?: string
  ): { user: RoomUser; state: RoomState } {
    if (!this.isValidRoomCode(roomCode)) {
      throw new Error('Room code must be a 6-digit number.');
    }
    if (!this.isValidUsername(creatorUsername)) {
      throw new Error('Username must contain alphabetic characters only (A-Z, a-z).');
    }
    if (this.rooms.has(roomCode)) {
      throw new Error(`Room with code ${roomCode} already exists.`);
    }

    const userId = existingUserId || crypto.randomUUID();
    const adminUser: RoomUser = {
      id: userId,
      socketId,
      username: creatorUsername.trim(),
      isAdmin: true,
      isOnline: true,
      lastSeen: Date.now(),
      ping: 0,
      drift: 0
    };

    // Initialize room with initial queue from presets for quick immediate playback
    const initialQueue: UnifiedMediaItem[] = PRESET_TRACKS.map((preset, idx) => ({
      ...preset,
      id: `queue-${Date.now()}-${idx}`,
      addedBy: creatorUsername.trim(),
      addedAt: Date.now()
    }));

    const currentTrack = initialQueue[0] || null;

    const initialPlayback: PlaybackState = {
      status: 'paused',
      currentTrack,
      position: 0,
      serverTimestamp: Date.now(),
      scheduledStartTime: null,
      playbackRate: 1.0
    };

    const initialSettings: RoomSettings = {
      repeatMode: 'all',
      isShuffle: false,
      sharedVolume: 100
    };

    const roomState: RoomState = {
      roomCode,
      adminId: userId,
      createdAt: Date.now(),
      playback: initialPlayback,
      queue: initialQueue,
      currentIndex: 0,
      users: [adminUser],
      settings: initialSettings
    };

    this.rooms.set(roomCode, {
      state: roomState,
      disconnectTimers: new Map(),
      roomCloseTimer: null
    });

    return { user: adminUser, state: roomState };
  }

  /**
   * Handles user joining a room or auto-creating if room does not exist.
   */
  public joinOrCreateRoom(
    roomCode: string,
    username: string,
    socketId: string,
    userId?: string
  ): { user: RoomUser; state: RoomState; isNewRoom: boolean; reconnected: boolean } {
    if (!this.isValidRoomCode(roomCode)) {
      throw new Error('Room code must be exactly 6 digits.');
    }
    if (!this.isValidUsername(username)) {
      throw new Error('Username must contain alphabetic characters only (A-Z, a-z).');
    }

    const cleanUsername = username.trim();
    const existingRoom = this.rooms.get(roomCode);

    // If room does not exist, auto-create it with this user as ADMIN
    if (!existingRoom) {
      const { user, state } = this.createRoom(roomCode, cleanUsername, socketId, userId);
      return { user, state, isNewRoom: true, reconnected: false };
    }

    // Room exists: check if this is a reconnection by the same userId
    const currentUsers = existingRoom.state.users;
    if (userId) {
      const existingUser = currentUsers.find(u => u.id === userId);
      if (existingUser) {
        // Reconnecting user!
        existingUser.socketId = socketId;
        existingUser.isOnline = true;
        existingUser.lastSeen = Date.now();
        // Update username if requested and still valid
        if (cleanUsername.toLowerCase() === existingUser.username.toLowerCase() || 
            !currentUsers.some(u => u.id !== userId && u.username.toLowerCase() === cleanUsername.toLowerCase())) {
          existingUser.username = cleanUsername;
        }

        // Clear disconnect timer if active
        const timer = existingRoom.disconnectTimers.get(userId);
        if (timer) {
          clearTimeout(timer);
          existingRoom.disconnectTimers.delete(userId);
        }

        // Cancel room close timer if running
        if (existingRoom.roomCloseTimer) {
          clearTimeout(existingRoom.roomCloseTimer);
          existingRoom.roomCloseTimer = null;
        }

        return { user: existingUser, state: existingRoom.state, isNewRoom: false, reconnected: true };
      }
    }

    // Check case-insensitive username uniqueness among currently active/registered users in this room
    const isDuplicateUsername = currentUsers.some(
      u => u.username.toLowerCase() === cleanUsername.toLowerCase() && u.isOnline
    );

    if (isDuplicateUsername) {
      throw new Error(`Username "${cleanUsername}" is already taken in room ${roomCode}. Please choose another name.`);
    }

    // User is joining as regular USER
    const newUserId = userId || crypto.randomUUID();
    const newUser: RoomUser = {
      id: newUserId,
      socketId,
      username: cleanUsername,
      isAdmin: false,
      isOnline: true,
      lastSeen: Date.now(),
      ping: 0,
      drift: 0
    };

    currentUsers.push(newUser);

    // Cancel room close timer if all users had previously left
    if (existingRoom.roomCloseTimer) {
      clearTimeout(existingRoom.roomCloseTimer);
      existingRoom.roomCloseTimer = null;
    }

    return { user: newUser, state: existingRoom.state, isNewRoom: false, reconnected: false };
  }

  /**
   * Handles user disconnecting (temporary disconnection grace period).
   */
  public handleUserDisconnect(
    socketId: string,
    onPermanentLeave?: (roomCode: string, user: RoomUser, promotedAdmin?: RoomUser) => void
  ): { roomCode: string; user: RoomUser } | null {
    for (const [roomCode, internal] of this.rooms.entries()) {
      const user = internal.state.users.find(u => u.socketId === socketId);
      if (user) {
        user.isOnline = false;
        user.lastSeen = Date.now();

        // Clear existing timer if any
        const existingTimer = internal.disconnectTimers.get(user.id);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        // Set grace period timer for permanent leave
        const timer = setTimeout(() => {
          this.removeUserPermanently(roomCode, user.id, onPermanentLeave);
        }, this.DISCONNECT_GRACE_PERIOD_MS);

        internal.disconnectTimers.set(user.id, timer);

        return { roomCode, user };
      }
    }
    return null;
  }

  /**
   * Explicitly leave the room immediately (user clicks Leave Room).
   */
  public leaveRoom(
    roomCode: string,
    userId: string,
    onAdminPromoted?: (newAdmin: RoomUser) => void
  ): { remainingUsers: RoomUser[]; promotedAdmin?: RoomUser; roomClosed: boolean } {
    const internal = this.rooms.get(roomCode);
    if (!internal) {
      return { remainingUsers: [], roomClosed: true };
    }

    const timer = internal.disconnectTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      internal.disconnectTimers.delete(userId);
    }

    const userIndex = internal.state.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return { remainingUsers: internal.state.users, roomClosed: false };
    }

    const wasAdmin = internal.state.users[userIndex].isAdmin;
    internal.state.users.splice(userIndex, 1);

    let promotedAdmin: RoomUser | undefined;

    // If room is now empty, close room
    if (internal.state.users.length === 0) {
      this.closeRoom(roomCode);
      return { remainingUsers: [], roomClosed: true };
    }

    // If the admin left, promote another participant to admin
    if (wasAdmin) {
      // Find an online user first, or the first remaining user
      const candidate = internal.state.users.find(u => u.isOnline) || internal.state.users[0];
      if (candidate) {
        candidate.isAdmin = true;
        internal.state.adminId = candidate.id;
        promotedAdmin = candidate;
        if (onAdminPromoted) onAdminPromoted(candidate);
      }
    }

    return {
      remainingUsers: internal.state.users,
      promotedAdmin,
      roomClosed: false
    };
  }

  /**
   * Permanently removes a user after the grace period expires.
   */
  private removeUserPermanently(
    roomCode: string,
    userId: string,
    callback?: (roomCode: string, user: RoomUser, promotedAdmin?: RoomUser) => void
  ): void {
    const internal = this.rooms.get(roomCode);
    if (!internal) return;

    internal.disconnectTimers.delete(userId);
    const user = internal.state.users.find(u => u.id === userId);
    if (!user || user.isOnline) return; // User came back online!

    const res = this.leaveRoom(roomCode, userId);
    if (callback && user) {
      callback(roomCode, user, res.promotedAdmin);
    }
  }

  /**
   * Admin ends the room permanently.
   */
  public endRoom(roomCode: string, requesterUserId: string): boolean {
    const internal = this.rooms.get(roomCode);
    if (!internal) return false;

    // Check if requester is admin
    const requester = internal.state.users.find(u => u.id === requesterUserId);
    if (!requester || !requester.isAdmin) {
      throw new Error('Only the room ADMIN can end the room.');
    }

    this.closeRoom(roomCode);
    return true;
  }

  /**
   * Closes a room and releases its code.
   */
  public closeRoom(roomCode: string): void {
    const internal = this.rooms.get(roomCode);
    if (!internal) return;

    // Clear all pending disconnect timers
    for (const timer of internal.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    internal.disconnectTimers.clear();

    if (internal.roomCloseTimer) {
      clearTimeout(internal.roomCloseTimer);
    }

    this.rooms.delete(roomCode);
  }

  /**
   * Check whether a user is admin in the given room.
   */
  public isUserAdmin(roomCode: string, userIdOrSocketId: string): boolean {
    const internal = this.rooms.get(roomCode);
    if (!internal) return false;
    const user = internal.state.users.find(
      u => u.id === userIdOrSocketId || u.socketId === userIdOrSocketId
    );
    return !!(user && user.isAdmin);
  }

  /**
   * Updates playback state for room (Admin only check should happen before).
   */
  public updatePlayback(roomCode: string, playback: PlaybackState): PlaybackState {
    const internal = this.rooms.get(roomCode);
    if (!internal) throw new Error('Room not found');

    internal.state.playback = playback;
    return internal.state.playback;
  }

  /**
   * Updates queue for room (Admin only).
   */
  public updateQueue(
    roomCode: string,
    queue: UnifiedMediaItem[],
    currentIndex?: number
  ): { queue: UnifiedMediaItem[]; currentIndex: number } {
    const internal = this.rooms.get(roomCode);
    if (!internal) throw new Error('Room not found');

    internal.state.queue = queue;
    if (currentIndex !== undefined) {
      internal.state.currentIndex = currentIndex;
    }
    return {
      queue: internal.state.queue,
      currentIndex: internal.state.currentIndex
    };
  }

  /**
   * Updates room settings (repeat, shuffle, volume).
   */
  public updateSettings(roomCode: string, settings: Partial<RoomSettings>): RoomSettings {
    const internal = this.rooms.get(roomCode);
    if (!internal) throw new Error('Room not found');

    internal.state.settings = {
      ...internal.state.settings,
      ...settings
    };
    return internal.state.settings;
  }

  /**
   * Updates client metrics (drift, ping).
   */
  public updateClientMetrics(
    roomCode: string,
    socketId: string,
    drift: number,
    ping: number
  ): void {
    const internal = this.rooms.get(roomCode);
    if (!internal) return;
    const user = internal.state.users.find(u => u.socketId === socketId);
    if (user) {
      user.drift = drift;
      user.ping = ping;
      user.lastSeen = Date.now();
    }
  }
}

