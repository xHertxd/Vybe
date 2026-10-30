import crypto from 'crypto';
import type {
  MediaItem,
  MediaItemInput,
  PlaybackState,
  RoomMember,
  RoomSettings,
  RoomState,
  RoomUser,
  MediaProvider,
} from '../types.js';
import { MediaSynchronizationEngine } from '../sync/mediaSynchronizationEngine.js';
import { UnifiedMediaQueue } from '../media/unifiedMediaQueue.js';

interface InternalRoom {
  state: Omit<RoomState, 'users'> & { users: RoomMember[] };
  disconnectTimers: Map<string, NodeJS.Timeout>;
  trackEndTimer: NodeJS.Timeout | null;
  lastActivity: number;
}

export interface RoomManagerHooks {
  playbackSync?: (roomCode: string, playback: PlaybackState) => void;
  roomUpdated?: (roomCode: string, state: RoomState) => void;
  queueUpdated?: (roomCode: string, queue: MediaItem[], currentIndex: number) => void;
  adminChanged?: (roomCode: string, admin: RoomUser) => void;
  roomClosed?: (roomCode: string, reason: 'empty' | 'ended' | 'expired') => void;
}

export interface RoomManagerOptions {
  disconnectGraceMs: number;
  maxUsersPerRoom: number;
  maxQueueLength: number;
}

export type RoomErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'FULL'
  | 'EXPIRED';

export class RoomError extends Error {
  constructor(
    message: string,
    public readonly code: RoomErrorCode = 'VALIDATION'
  ) {
    super(message);
    this.name = 'RoomError';
  }
}

const USERNAME_RE = /^[A-Za-z]{2,20}$/;
const ROOM_CODE_RE = /^\d{6}$/;

export class RoomManager {
  private readonly rooms = new Map<string, InternalRoom>();
  private hooks: RoomManagerHooks = {};

  constructor(
    private readonly sync: MediaSynchronizationEngine,
    private readonly options: RoomManagerOptions
  ) {}

  public setHooks(hooks: RoomManagerHooks): void {
    this.hooks = hooks;
  }

  // ---------------------------------------------------------------------------
  // Codes & validation
  // ---------------------------------------------------------------------------

  public generateUniqueRoomCode(): string {
    for (let attempt = 0; attempt < 900_000; attempt += 1) {
      const code = String(crypto.randomInt(100_000, 1_000_000));
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError('No room codes are available right now. Please try again.', 'FULL');
  }

  public isValidRoomCode(code: unknown): code is string {
    return typeof code === 'string' && ROOM_CODE_RE.test(code);
  }

  public validateUsername(username: unknown): string {
    if (typeof username !== 'string') {
      throw new RoomError('Please enter a username.', 'VALIDATION');
    }
    const clean = username.trim();
    if (!clean) throw new RoomError('Please enter a username.', 'VALIDATION');
    if (!USERNAME_RE.test(clean)) {
      throw new RoomError(
        'Usernames must be 2–20 characters and contain letters only (A–Z).',
        'VALIDATION'
      );
    }
    return clean;
  }

  public roomExists(code: string): boolean {
    return this.rooms.has(code);
  }

  // ---------------------------------------------------------------------------
  // Room lifecycle
  // ---------------------------------------------------------------------------

  public createRoom(
    roomCode: string,
    username: string,
    socketId: string,
    userId?: string
  ): { user: RoomUser; state: RoomState; sessionToken: string } {
    if (!this.isValidRoomCode(roomCode)) {
      throw new RoomError('Room codes must be exactly 6 digits.', 'VALIDATION');
    }
    const cleanName = this.validateUsername(username);
    if (this.rooms.has(roomCode)) {
      throw new RoomError('That room code is already active. Try joining it instead.', 'CONFLICT');
    }

    const member = this.makeMember(cleanName, socketId, userId, true);
    const now = Date.now();
    const state: InternalRoom['state'] = {
      roomCode,
      adminId: member.id,
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
      users: [member],
      settings: {
        repeatMode: 'all',
        isShuffle: false,
        sharedVolume: 100,
        playbackControl: 'admin',
        crossfade: 4,
        automix: true,
      },
      version: now,
    };

    this.rooms.set(roomCode, {
      state,
      disconnectTimers: new Map(),
      trackEndTimer: null,
      lastActivity: now,
    });

    const publicState = this.serialize(roomCode);
    if (publicState) this.hooks.roomUpdated?.(roomCode, publicState);
    return {
      user: this.toPublicUser(member),
      state: publicState!,
      sessionToken: member.sessionToken,
    };
  }

  public joinOrCreateRoom(
    roomCode: string,
    username: string,
    socketId: string,
    userId?: string,
    sessionToken?: string
  ): {
    user: RoomUser;
    state: RoomState;
    isNewRoom: boolean;
    reconnected: boolean;
    sessionToken: string;
  } {
    if (!this.isValidRoomCode(roomCode)) {
      throw new RoomError('Room codes must be exactly 6 digits.', 'VALIDATION');
    }
    const cleanName = this.validateUsername(username);

    const room = this.rooms.get(roomCode);
    if (!room) {
      const created = this.createRoom(roomCode, cleanName, socketId, userId);
      return { ...created, isNewRoom: true, reconnected: false };
    }

    this.touch(roomCode);

    if (userId) {
      const existing = room.state.users.find((user) => user.id === userId);
      if (existing) {
        if (!sessionToken || existing.sessionToken !== sessionToken) {
          throw new RoomError(
            'That participant session could not be verified. Rejoin with a new username.',
            'FORBIDDEN'
          );
        }
        this.reattach(roomCode, existing, cleanName, socketId);
        return {
          user: this.toPublicUser(existing),
          state: this.serialize(roomCode)!,
          isNewRoom: false,
          reconnected: true,
          sessionToken: existing.sessionToken,
        };
      }
    }

    if (room.state.users.length >= this.options.maxUsersPerRoom) {
      throw new RoomError('This room is full. Try again in a moment.', 'FULL');
    }

    const duplicate = room.state.users.find(
      (user) => user.username.toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      throw new RoomError(
        duplicate.isOnline
          ? `“${cleanName}” is already in this room. Choose another name.`
          : `“${cleanName}” is temporarily held by a reconnecting listener. Choose another name or wait a few seconds.`,
        'CONFLICT'
      );
    }

    const member = this.makeMember(cleanName, socketId, userId, false);
    room.state.users.push(member);
    room.state.version = Date.now();
    room.lastActivity = Date.now();
    this.publishRoom(roomCode);

    return {
      user: this.toPublicUser(member),
      state: this.serialize(roomCode)!,
      isNewRoom: false,
      reconnected: false,
      sessionToken: member.sessionToken,
    };
  }

  public resumeRoom(
    roomCode: string,
    userId: string,
    sessionToken: string,
    socketId: string,
    username?: string
  ): { user: RoomUser; state: RoomState } {
    if (!this.isValidRoomCode(roomCode)) {
      throw new RoomError('Invalid room code.', 'VALIDATION');
    }
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new RoomError('That room is no longer active.', 'EXPIRED');
    }

    const member = room.state.users.find((user) => user.id === userId);
    if (!member || !sessionToken || member.sessionToken !== sessionToken) {
      throw new RoomError('Your session is no longer valid in this room.', 'EXPIRED');
    }

    const cleanName = username ? this.validateUsername(username) : member.username;
    this.reattach(roomCode, member, cleanName, socketId);
    return { user: this.toPublicUser(member), state: this.serialize(roomCode)! };
  }

  private reattach(
    roomCode: string,
    member: RoomMember,
    cleanName: string,
    socketId: string
  ): void {
    const room = this.rooms.get(roomCode);
    if (!room) throw new RoomError('That room is no longer active.', 'EXPIRED');

    if (cleanName.toLowerCase() !== member.username.toLowerCase()) {
      const conflict = room.state.users.find(
        (user) =>
          user.id !== member.id && user.username.toLowerCase() === cleanName.toLowerCase()
      );
      if (conflict) {
        throw new RoomError(`“${cleanName}” is already taken in this room.`, 'CONFLICT');
      }
      member.username = cleanName;
    }

    const timer = room.disconnectTimers.get(member.id);
    if (timer) {
      clearTimeout(timer);
      room.disconnectTimers.delete(member.id);
    }

    member.socketId = socketId;
    member.isOnline = true;
    room.state.version = Date.now();
    room.lastActivity = Date.now();
    this.publishRoom(roomCode);
  }

  public markDisconnected(
    socketId: string,
    onExpire: (roomCode: string, userId: string, promotedAdmin?: RoomUser) => void
  ): { roomCode: string; userId: string; username: string } | null {
    for (const [roomCode, room] of this.rooms) {
      const member = room.state.users.find((user) => user.socketId === socketId);
      if (!member) continue;

      member.isOnline = false;
      room.state.version = Date.now();
      this.publishRoom(roomCode);

      const existingTimer = room.disconnectTimers.get(member.id);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(() => {
        const currentRoom = this.rooms.get(roomCode);
        const currentMember = currentRoom?.state.users.find((user) => user.id === member.id);
        if (!currentRoom || !currentMember || currentMember.isOnline) {
          currentRoom?.disconnectTimers.delete(member.id);
          return;
        }
        const result = this.leaveRoom(roomCode, member.id);
        onExpire(roomCode, member.id, result.promotedAdmin);
      }, this.options.disconnectGraceMs);

      timer.unref?.();
      room.disconnectTimers.set(member.id, timer);

      return { roomCode, userId: member.id, username: member.username };
    }
    return null;
  }

  public leaveRoom(
    roomCode: string,
    userId: string
  ): {
    roomClosed: boolean;
    promotedAdmin?: RoomUser;
    remainingUsers: RoomUser[];
  } {
    const room = this.rooms.get(roomCode);
    if (!room) return { roomClosed: true, remainingUsers: [] };

    const timer = room.disconnectTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      room.disconnectTimers.delete(userId);
    }

    const index = room.state.users.findIndex((user) => user.id === userId);
    if (index === -1) {
      return {
        roomClosed: false,
        remainingUsers: room.state.users.map((user) => this.toPublicUser(user)),
      };
    }

    const wasAdmin = room.state.users[index].isAdmin;
    room.state.users.splice(index, 1);
    room.state.version = Date.now();
    room.lastActivity = Date.now();

    if (room.state.users.length === 0) {
      this.closeRoom(roomCode, 'empty');
      return { roomClosed: true, remainingUsers: [] };
    }

    let promotedAdmin: RoomUser | undefined;
    if (wasAdmin) {
      const candidate =
        room.state.users.find((user) => user.isOnline) || room.state.users[0];
      room.state.users.forEach((user) => {
        user.isAdmin = user.id === candidate.id;
      });
      room.state.adminId = candidate.id;
      promotedAdmin = this.toPublicUser(candidate);
      this.hooks.adminChanged?.(roomCode, promotedAdmin);
    }

    this.publishRoom(roomCode);
    return {
      roomClosed: false,
      promotedAdmin,
      remainingUsers: room.state.users.map((user) => this.toPublicUser(user)),
    };
  }

  public endRoom(roomCode: string, requesterUserId: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) throw new RoomError('That room is no longer active.', 'NOT_FOUND');
    if (!this.isAdmin(roomCode, requesterUserId)) {
      throw new RoomError('Only the room admin can end the room.', 'FORBIDDEN');
    }
    this.closeRoom(roomCode, 'ended');
  }

  public transferAdmin(roomCode: string, requesterUserId: string, targetUserId: string): RoomUser {
    const room = this.rooms.get(roomCode);
    if (!room) throw new RoomError('That room is no longer active.', 'NOT_FOUND');
    if (!this.isAdmin(roomCode, requesterUserId)) {
      throw new RoomError('Only the current admin can transfer host privileges.', 'FORBIDDEN');
    }
    const target = room.state.users.find((u) => u.id === targetUserId);
    if (!target) throw new RoomError('Target user is not in the room.', 'NOT_FOUND');

    room.state.users.forEach((u) => {
      u.isAdmin = u.id === targetUserId;
    });
    room.state.adminId = targetUserId;
    room.state.version = Date.now();
    this.publishRoom(roomCode);
    const publicTarget = this.toPublicUser(target);
    this.hooks.adminChanged?.(roomCode, publicTarget);
    return publicTarget;
  }

  
  public claimAdmin(roomCode: string, requesterUserId: string): RoomUser {
    const room = this.rooms.get(roomCode);
    if (!room) throw new RoomError('That room is no longer active.', 'NOT_FOUND');
    const requester = room.state.users.find((u) => u.id === requesterUserId);
    if (!requester) throw new RoomError('You are not in this room.', 'FORBIDDEN');

    const currentAdmin = room.state.users.find((u) => u.id === room.state.adminId);
    const canClaim = !currentAdmin || !currentAdmin.isOnline || room.state.users.filter(u => u.isOnline).length <= 1;
    if (!canClaim) {
      throw new RoomError('The current host is still in the room.', 'FORBIDDEN');
    }

    room.state.users.forEach((u) => {
      u.isAdmin = u.id === requesterUserId;
    });
    room.state.adminId = requesterUserId;
    room.state.version = Date.now();
    this.publishRoom(roomCode);
    const publicTarget = this.toPublicUser(requester);
    this.hooks.adminChanged?.(roomCode, publicTarget);
    return publicTarget;
  }

  public kickUser(roomCode: string, requesterUserId: string, targetUserId: string): { remainingUsers: RoomUser[] } {
    const room = this.rooms.get(roomCode);
    if (!room) throw new RoomError('That room is no longer active.', 'NOT_FOUND');
    if (!this.isAdmin(roomCode, requesterUserId)) {
      throw new RoomError('Only the admin can kick members.', 'FORBIDDEN');
    }
    if (requesterUserId === targetUserId) {
      throw new RoomError('Admin cannot kick themselves.', 'VALIDATION');
    }
    return this.leaveRoom(roomCode, targetUserId);
  }

  public closeRoom(roomCode: string, reason: 'empty' | 'ended' | 'expired'): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    for (const timer of room.disconnectTimers.values()) clearTimeout(timer);
    room.disconnectTimers.clear();
    if (room.trackEndTimer) clearTimeout(room.trackEndTimer);
    this.rooms.delete(roomCode);
    this.hooks.roomClosed?.(roomCode, reason);
  }

  public purgeIdleRooms(idleTimeoutMs: number): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const hasOnline = room.state.users.some((user) => user.isOnline);
      if (!hasOnline) continue;
      if (now - room.lastActivity > idleTimeoutMs) this.closeRoom(code, 'expired');
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  public getState(roomCode: string): RoomState | null {
    return this.serialize(roomCode);
  }

  public getRoomCodes(): string[] {
    return [...this.rooms.keys()];
  }

  public getPlayback(roomCode: string): PlaybackState | null {
    return this.rooms.get(roomCode)?.state.playback ?? null;
  }

  public getQueue(roomCode: string): { queue: MediaItem[]; currentIndex: number } | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    return { queue: this.cloneQueue(room.state.queue), currentIndex: room.state.currentIndex };
  }

  public isMember(roomCode: string, userId: string): boolean {
    return Boolean(this.rooms.get(roomCode)?.state.users.some((user) => user.id === userId));
  }

  public isAdmin(roomCode: string, userId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    return room.state.adminId === userId &&
      Boolean(room.state.users.find((user) => user.id === userId)?.isAdmin);
  }

  public canControl(roomCode: string, userId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    // Admin always has control
    if (this.isAdmin(roomCode, userId)) return true;

    // If room is set to 'anyone' control, all members have control
    if (room.state.settings.playbackControl === 'anyone') return true;

    // When admin is offline or left, all online listeners have control until admin comes back!
    const adminOnline = room.state.users.some((user) => user.isAdmin && user.isOnline);
    if (!adminOnline) {
      return true;
    }

    return false;
  }

  public updateUserMetrics(
    roomCode: string,
    userId: string,
    drift: number,
    ping: number
  ): void {
    const room = this.rooms.get(roomCode);
    const member = room?.state.users.find((user) => user.id === userId);
    if (!member) return;
    member.drift = Math.max(0, Math.min(5_000, Math.round(drift)));
    member.ping = Math.max(0, Math.min(5_000, Math.round(ping)));
    room!.lastActivity = Date.now();
    // Presence metrics are intentionally not broadcast on every heartbeat; the
    // next room snapshot includes them, which avoids needless websocket churn.
  }

  public authoritativePosition(roomCode: string): number {
    const room = this.rooms.get(roomCode);
    if (!room) return 0;
    return this.sync.positionAt(room.state.playback);
  }

  public heartbeatSnapshot(roomCode: string): PlaybackState | null {
    const playback = this.rooms.get(roomCode)?.state.playback;
    if (!playback) return null;
    return this.sync.snapshot(playback);
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  public play(roomCode: string, userId: string): PlaybackState {
    const room = this.requireAdminRoom(roomCode, userId);
    const track = room.state.playback.currentTrack;
    if (!track) throw new RoomError('Add something to the queue first.', 'VALIDATION');

    const current = this.sync.positionAt(room.state.playback);
    const duration = track.duration;
    const position = duration > 0 && current >= duration - 0.2 ? 0 : current;

    const playback = this.sync.createState(
      'playing',
      position,
      track,
      room.state.playback.playbackRate || 1
    );
    this.setPlayback(roomCode, playback);
    return playback;
  }

  public pause(roomCode: string, userId: string): PlaybackState {
    const room = this.requireAdminRoom(roomCode, userId);
    const track = room.state.playback.currentTrack;
    if (!track) throw new RoomError('Nothing is playing.', 'VALIDATION');

    const position = this.sync.positionAt(room.state.playback);
    const playback = this.sync.createState('paused', position, track, 1);
    this.setPlayback(roomCode, playback);
    return playback;
  }

  public seek(roomCode: string, userId: string, rawPosition: number): PlaybackState {
    const room = this.requireAdminRoom(roomCode, userId);
    const track = room.state.playback.currentTrack;
    if (!track) throw new RoomError('Nothing is playing.', 'VALIDATION');

    const duration = track.duration;
    let position = Number.isFinite(rawPosition) ? Math.max(0, rawPosition) : 0;
    if (duration > 0) position = Math.min(duration, position);

    const isPlaying = room.state.playback.status === 'playing';
    const playback = this.sync.createState(
      isPlaying ? 'playing' : 'paused',
      position,
      track,
      1,
      Math.min(350, this.syncDelay())
    );
    this.setPlayback(roomCode, playback);
    return playback;
  }

  public forceSync(roomCode: string, userId?: string): PlaybackState {
    const room = this.rooms.get(roomCode);
    if (!room) throw new RoomError('That room is no longer active.', 'NOT_FOUND');
    if (userId && !this.isMember(roomCode, userId)) {
      throw new RoomError('You are not in this room.', 'FORBIDDEN');
    }

    const currentTrack = room.state.playback.currentTrack;
    if (!currentTrack) return room.state.playback;

    const now = Date.now();
    const position = this.sync.positionAt(room.state.playback, now);
    const isPlaying = room.state.playback.status === 'playing';

    // Authoritative resync anchored immediately to now (no delay freezing playback)
    const playback: PlaybackState = {
      status: isPlaying ? 'playing' : 'paused',
      currentTrack,
      position,
      serverTimestamp: now,
      scheduledStartTime: null,
      playbackRate: 1,
      version: now,
    };

    this.setPlayback(roomCode, playback);
    return playback;
  }

  public next(roomCode: string, userId: string): PlaybackState {
    const room = this.requireAdminRoom(roomCode, userId);
    return this.advance(roomCode, 1, false);
  }

  public previous(roomCode: string, userId: string): PlaybackState {
    const room = this.requireAdminRoom(roomCode, userId);
    const track = room.state.playback.currentTrack;
    const position = this.sync.positionAt(room.state.playback);

    if (track && position > 4 && room.state.queue.length > 1) {
      const restarted = this.sync.createState('playing', 0, track, 1);
      this.setPlayback(roomCode, restarted);
      return restarted;
    }

    return this.advance(roomCode, -1, false);
  }

  public completeTrack(roomCode: string, trackId: string, requesterUserId?: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    if (requesterUserId && !this.isMember(roomCode, requesterUserId)) return;
    if (!room.state.playback.currentTrack || room.state.playback.currentTrack.id !== trackId) {
      return;
    }
    if (room.state.playback.status !== 'playing') return;

    // Ignore premature "ended" reports from a client that has not reached the
    // end of the media. This prevents a malicious or broken client from skipping.
    const position = this.sync.positionAt(room.state.playback);
    const duration = room.state.playback.currentTrack.duration;
    if (duration > 0 && position < duration - 6) return;

    this.advance(roomCode, 1, true);
  }

  private advance(roomCode: string, direction: 1 | -1, automatic: boolean): PlaybackState {
    const room = this.rooms.get(roomCode);
    if (!room) throw new RoomError('Room not found.', 'NOT_FOUND');

    const { queue, settings } = room.state;
    if (queue.length === 0) {
      const stopped = this.sync.createState('stopped', 0, null);
      this.setPlayback(roomCode, stopped);
      return stopped;
    }

    if (automatic && settings.repeatMode === 'one' && direction === 1) {
      const track = room.state.playback.currentTrack;
      const looped = this.sync.createState('playing', 0, track, 1, 250);
      this.setPlayback(roomCode, looped);
      return looped;
    }

    let nextIndex: number;
    if (settings.isShuffle && queue.length > 1) {
      const indexes = queue
        .map((_, index) => index)
        .filter((index) => index !== room.state.currentIndex);
      nextIndex = indexes[Math.floor(Math.random() * indexes.length)] ?? 0;
    } else {
      nextIndex = room.state.currentIndex + direction;
      if (nextIndex >= queue.length) {
        if (!automatic || settings.repeatMode === 'all') {
          nextIndex = 0;
        } else {
          const last = room.state.playback.currentTrack;
          const stopped = this.sync.createState('paused', last?.duration || 0, last, 1);
          this.setPlayback(roomCode, stopped);
          return stopped;
        }
      }
      if (nextIndex < 0) {
        nextIndex = queue.length - 1;
      }
    }

    room.state.currentIndex = nextIndex;
    const nextTrack = queue[nextIndex];
    const playback = this.sync.createState('playing', 0, nextTrack, 1);
    this.setPlayback(roomCode, playback);
    this.hooks.queueUpdated?.(roomCode, this.cloneQueue(queue), nextIndex);
    return playback;
  }

  public playIndex(roomCode: string, userId: string, index: number): PlaybackState {
    const room = this.requireAdminRoom(roomCode, userId);
    if (!Number.isInteger(index) || index < 0 || index >= room.state.queue.length) {
      throw new RoomError('That queue item does not exist.', 'VALIDATION');
    }

    room.state.currentIndex = index;
    const track = room.state.queue[index];
    const playback = this.sync.createState('playing', 0, track, 1);
    this.setPlayback(roomCode, playback);
    this.hooks.queueUpdated?.(roomCode, this.cloneQueue(room.state.queue), index);
    return playback;
  }

  // ---------------------------------------------------------------------------
  // Queue
  // ---------------------------------------------------------------------------

  public addMedia(
    roomCode: string,
    userId: string,
    inputs: MediaItemInput[]
  ): { added: MediaItem[]; playback?: PlaybackState } {
    const room = this.requireAdminRoom(roomCode, userId);
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new RoomError('No media was provided.', 'VALIDATION');
    }
    if (room.state.queue.length + inputs.length > this.options.maxQueueLength) {
      throw new RoomError(
        `This room's queue is limited to ${this.options.maxQueueLength} items.`,
        'VALIDATION'
      );
    }

    const member = room.state.users.find((user) => user.id === userId)!;
    const added = inputs.map((input) => this.sanitizeMediaInput(input, member.username));
    room.state.queue.push(...added);

    let playback: PlaybackState | undefined;
    if (!room.state.playback.currentTrack && room.state.queue.length > 0) {
      room.state.currentIndex = 0;
      playback = this.sync.createState('playing', 0, room.state.queue[0], 1);
      this.setPlayback(roomCode, playback, false);
    } else if (room.state.currentIndex >= room.state.queue.length) {
      room.state.currentIndex = Math.max(0, room.state.queue.length - 1);
    }

    room.state.version = Date.now();
    room.lastActivity = Date.now();
    this.hooks.queueUpdated?.(
      roomCode,
      this.cloneQueue(room.state.queue),
      room.state.currentIndex
    );
    this.publishRoom(roomCode);

    return { added: this.cloneQueue(added), playback };
  }

  public removeMedia(roomCode: string, userId: string, itemId: string): PlaybackState | null {
    const room = this.requireAdminRoom(roomCode, userId);
    const currentTrackId = room.state.playback.currentTrack?.id;
    const result = UnifiedMediaQueue.remove(room.state.queue, room.state.currentIndex, itemId);
    if (result.queue === room.state.queue) return null;

    room.state.queue = result.queue;
    room.state.currentIndex = result.currentIndex;
    room.state.version = Date.now();

    let playback: PlaybackState | null = null;
    if (result.removedCurrent) {
      const nextTrack = room.state.queue[room.state.currentIndex] || null;
      if (nextTrack) {
        playback = this.sync.createState(
          room.state.playback.status === 'playing' ? 'playing' : 'paused',
          0,
          nextTrack,
          1
        );
      } else {
        playback = this.sync.createState('stopped', 0, null);
      }
      this.setPlayback(roomCode, playback, false);
    } else if (currentTrackId) {
      const current = room.state.queue.find((item) => item.id === currentTrackId);
      if (current) room.state.playback.currentTrack = current;
    }

    this.hooks.queueUpdated?.(
      roomCode,
      this.cloneQueue(room.state.queue),
      room.state.currentIndex
    );
    this.publishRoom(roomCode);
    return playback;
  }

  public reorderQueue(
    roomCode: string,
    userId: string,
    fromIndex: number,
    toIndex: number
  ): void {
    const room = this.requireAdminRoom(roomCode, userId);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
      throw new RoomError('Invalid queue position.', 'VALIDATION');
    }

    const result = UnifiedMediaQueue.reorder(
      room.state.queue,
      room.state.currentIndex,
      fromIndex,
      toIndex
    );
    if (result.queue === room.state.queue) return;

    room.state.queue = result.queue;
    room.state.currentIndex = result.currentIndex;
    room.state.version = Date.now();
    room.state.playback.currentTrack =
      room.state.queue[room.state.currentIndex] || room.state.playback.currentTrack;

    this.hooks.queueUpdated?.(
      roomCode,
      this.cloneQueue(room.state.queue),
      room.state.currentIndex
    );
    this.publishRoom(roomCode);
  }

  public clearQueue(roomCode: string, userId: string): PlaybackState {
    const room = this.requireAdminRoom(roomCode, userId);
    room.state.queue = [];
    room.state.currentIndex = 0;
    room.state.version = Date.now();

    const playback = this.sync.createState('stopped', 0, null);
    this.setPlayback(roomCode, playback, false);
    this.hooks.queueUpdated?.(roomCode, [], 0);
    this.publishRoom(roomCode);
    return playback;
  }

  public updateSettings(
    roomCode: string,
    userId: string,
    settings: Partial<RoomSettings>
  ): RoomSettings {
    const room = this.requireAdminRoom(roomCode, userId);
    const next = { ...room.state.settings };

    if (settings.repeatMode && ['off', 'all', 'one'].includes(settings.repeatMode)) {
      next.repeatMode = settings.repeatMode;
    }
    if (typeof settings.isShuffle === 'boolean') {
      next.isShuffle = settings.isShuffle;
    }
    if (settings.playbackControl && ['admin', 'anyone'].includes(settings.playbackControl)) {
      next.playbackControl = settings.playbackControl;
    }
    if (typeof settings.sharedVolume === 'number' && Number.isFinite(settings.sharedVolume)) {
      next.sharedVolume = Math.max(0, Math.min(100, Math.round(settings.sharedVolume)));
    }
    if (typeof settings.crossfade === 'number' && Number.isFinite(settings.crossfade)) {
      next.crossfade = Math.max(0, Math.min(12, Math.round(settings.crossfade)));
    }
    if (typeof settings.automix === 'boolean') {
      next.automix = settings.automix;
    }

    room.state.settings = next;
    room.state.version = Date.now();
    this.publishRoom(roomCode);
    return { ...next };
  }

  public updateTrackDuration(
    roomCode: string,
    itemId: string,
    duration: number,
    requesterUserId: string
  ): void {
    if (!this.isMember(roomCode, requesterUserId)) return;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 86_400) return;

    const room = this.rooms.get(roomCode);
    if (!room) return;

    const rounded = Math.round(duration);
    const item = room.state.queue.find((entry) => entry.id === itemId);
    if (!item || item.duration === rounded) return;

    item.duration = rounded;
    if (room.state.playback.currentTrack?.id === itemId) {
      room.state.playback.currentTrack = item;
      this.scheduleTrackEnd(roomCode);
    }
    room.state.version = Date.now();
    this.publishRoom(roomCode);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private syncDelay(): number {
    // The sync engine owns its delay; this mirrors it for tiny local seeks.
    return 350;
  }

  private requireAdminRoom(roomCode: string, userId: string): InternalRoom {
    const room = this.rooms.get(roomCode);
    if (!room) throw new RoomError('That room is no longer active.', 'NOT_FOUND');
    if (!this.canControl(roomCode, userId)) {
      throw new RoomError('Playback control is currently restricted to the host.', 'FORBIDDEN');
    }
    this.touch(roomCode);
    return room;
  }

  private makeMember(
    username: string,
    socketId: string,
    userId: string | undefined,
    isAdmin: boolean
  ): RoomMember {
    return {
      id: userId || crypto.randomUUID(),
      socketId,
      username,
      isAdmin,
      isOnline: true,
      ping: 0,
      drift: 0,
      connectedAt: Date.now(),
      sessionToken: crypto.randomBytes(24).toString('hex'),
    };
  }

  private sanitizeMediaInput(input: MediaItemInput, addedBy: string): MediaItem {
    const providers: MediaProvider[] = ['youtube', 'spotify', 'audio'];
    if (!input || !providers.includes(input.provider)) {
      throw new RoomError('Unsupported media provider.', 'VALIDATION');
    }
    if (typeof input.url !== 'string' || input.url.length > 2_000) {
      throw new RoomError('Invalid media URL.', 'VALIDATION');
    }

    return {
      id: `q_${crypto.randomUUID()}`,
      provider: input.provider,
      sourceType: input.sourceType || 'url',
      mediaId: String(input.mediaId || '').slice(0, 200),
      url: input.url,
      title: String(input.title || 'Untitled').slice(0, 300),
      artist: String(input.artist || 'Unknown').slice(0, 200),
      album: input.album ? String(input.album).slice(0, 300) : undefined,
      thumbnail: String(input.thumbnail || '').slice(0, 2_000),
      duration:
        Number.isFinite(input.duration) && input.duration > 0
          ? Math.min(Math.round(input.duration), 86_400)
          : 0,
      isPlayable: input.isPlayable !== false,
      unavailabilityReason: input.unavailabilityReason
        ? String(input.unavailabilityReason).slice(0, 500)
        : undefined,
      addedBy,
      addedAt: Date.now(),
    };
  }

  private setPlayback(
    roomCode: string,
    playback: PlaybackState,
    publish = true
  ): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    room.state.playback = playback;
    room.state.version = Date.now();
    room.lastActivity = Date.now();
    this.scheduleTrackEnd(roomCode);

    if (publish) {
      this.hooks.playbackSync?.(roomCode, playback);
      this.publishRoom(roomCode);
    }
  }

  private scheduleTrackEnd(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    if (room.trackEndTimer) {
      clearTimeout(room.trackEndTimer);
      room.trackEndTimer = null;
    }

    const playback = room.state.playback;
    if (playback.status !== 'playing' || !playback.currentTrack) return;
    if (playback.currentTrack.duration <= 0) return;

    const now = Date.now();
    const startDelay =
      playback.scheduledStartTime && playback.scheduledStartTime > now
        ? playback.scheduledStartTime - now
        : 0;
    const position = this.sync.positionAt(playback, now);
    const remaining = Math.max(0, playback.currentTrack.duration - position) * 1000;
    const delay = Math.max(100, remaining + startDelay + 80);

    const timer = setTimeout(() => {
      const current = this.rooms.get(roomCode);
      if (!current || current.state.playback.status !== 'playing') return;
      this.advance(roomCode, 1, true);
    }, delay);
    timer.unref?.();
    room.trackEndTimer = timer;
  }

  private touch(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (room) room.lastActivity = Date.now();
  }

  private publishRoom(roomCode: string): void {
    const state = this.serialize(roomCode);
    if (state) this.hooks.roomUpdated?.(roomCode, state);
  }

  private toPublicUser(member: RoomMember): RoomUser {
    return {
      id: member.id,
      username: member.username,
      isAdmin: member.isAdmin,
      isOnline: member.isOnline,
      ping: member.ping,
      drift: member.drift,
    };
  }

  private cloneQueue(queue: MediaItem[]): MediaItem[] {
    return queue.map((item) => ({ ...item }));
  }

  private serialize(roomCode: string): RoomState | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    return {
      roomCode: room.state.roomCode,
      adminId: room.state.adminId,
      createdAt: room.state.createdAt,
      playback: {
        ...room.state.playback,
        currentTrack: room.state.playback.currentTrack
          ? { ...room.state.playback.currentTrack }
          : null,
      },
      queue: this.cloneQueue(room.state.queue),
      currentIndex: room.state.currentIndex,
      users: room.state.users.map((member) => this.toPublicUser(member)),
      settings: { ...room.state.settings },
      version: room.state.version,
    };
  }
}
