import type { Server, Socket } from 'socket.io';
import type {
  RoomState,
  Participant,
  Track,
  PlaybackState,
  JoinRoomPayload,
  PlaybackControlPayload,
  QueueAddPayload,
  QueueAddMultiplePayload,
  QueueReorderPayload,
  AdminTransferPayload,
  KickParticipantPayload,
  QueueRemovePayload,
  QueueSkipPayload,
  DriftReportPayload,
} from './types.js';

// Ephemeral in-memory store: Zero database, zero disk writes
const rooms = new Map<string, RoomState>();
const socketToRoom = new Map<string, { roomCode: string; participantId: string }>();
const cleanupTimers = new Map<string, NodeJS.Timeout>();

const SCHEDULE_DELAY_MS = 400; // 400ms buffer lead time for sample-accurate simultaneous playback

function generateRoomCode(): string {
  let code = '';
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));
  return code;
}

export function computeCurrentPosition(playback: PlaybackState): number {
  if (playback.status !== 'playing' || !playback.currentTrack) {
    return Math.max(0, playback.position);
  }

  const now = Date.now();
  const anchorTime = playback.scheduledStartTime ?? playback.serverTimestamp;
  if (now < anchorTime) {
    return Math.max(0, playback.position);
  }

  const elapsedSec = (now - anchorTime) / 1000;
  const currentPos = playback.position + elapsedSec * (playback.playbackRate || 1.0);
  const duration = playback.currentTrack.duration;

  if (duration > 0 && currentPos >= duration) {
    return duration;
  }
  return Math.max(0, currentPos);
}

export function setupRelayHandlers(io: Server, socket: Socket): void {
  // -------------------------------------------------------------
  // 1. Create Room
  // -------------------------------------------------------------
  socket.on('room:create', (payload: { roomCode?: string; username?: string }, callback?: (res: { success: boolean; room?: RoomState; error?: string }) => void) => {
    try {
      const roomCode = payload?.roomCode?.trim() || generateRoomCode();
      const username = payload?.username?.trim() || `Host_${socket.id.slice(0, 4)}`;

      const host: Participant = {
        id: socket.id,
        username,
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
        code: roomCode,
        hostId: socket.id,
        playback: initialPlayback,
        queue: [],
        queueIndex: 0,
        participants: [host],
      };

      rooms.set(roomCode, room);
      socketToRoom.set(socket.id, { roomCode, participantId: socket.id });
      socket.join(roomCode);

      socket.emit('room:joined', { room, isHost: true, selfId: socket.id });
      callback?.({ success: true, room });
    } catch (err) {
      callback?.({ success: false, error: 'Failed to create room.' });
    }
  });

  // -------------------------------------------------------------
  // 2. Join Room
  // -------------------------------------------------------------
  socket.on('room:join', (payload: JoinRoomPayload, callback?: (res: { success: boolean; room?: RoomState; error?: string }) => void) => {
    try {
      const roomCode = payload?.roomCode?.trim();
      if (!roomCode) {
        callback?.({ success: false, error: 'Room code required.' });
        return;
      }

      // If room doesn't exist, create it immediately with the requested code!
      if (!rooms.has(roomCode)) {
        const username = payload?.username?.trim() || `Host_${socket.id.slice(0, 4)}`;
        const host: Participant = {
          id: socket.id,
          username,
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
          code: roomCode,
          hostId: socket.id,
          playback: initialPlayback,
          queue: [],
          queueIndex: 0,
          participants: [host],
        };

        rooms.set(roomCode, room);
        socketToRoom.set(socket.id, { roomCode, participantId: socket.id });
        socket.join(roomCode);

        socket.emit('room:joined', { room, isHost: true, selfId: socket.id });
        callback?.({ success: true, room });
        return;
      }

      // Clear any pending room auto-deletion timer if participants reconnected
      if (cleanupTimers.has(roomCode)) {
        clearTimeout(cleanupTimers.get(roomCode)!);
        cleanupTimers.delete(roomCode);
      }

      const room = rooms.get(roomCode)!;
      const username = payload?.username?.trim() || `Guest_${socket.id.slice(0, 4)}`;

      // Check if participant already exists in room
      let participant = room.participants.find((p) => p.id === socket.id);
      if (!participant) {
        participant = {
          id: socket.id,
          username,
          isHost: room.participants.length === 0,
          driftMs: 0,
          joinedAt: Date.now(),
        };
        room.participants.push(participant);
      } else {
        participant.username = username;
      }

      if (participant.isHost) {
        room.hostId = socket.id;
      }

      socketToRoom.set(socket.id, { roomCode, participantId: socket.id });
      socket.join(roomCode);

      // Refresh current position snapshot for joining client
      const freshPosition = computeCurrentPosition(room.playback);
      const updatedPlayback: PlaybackState = {
        ...room.playback,
        position: freshPosition,
        serverTimestamp: Date.now(),
      };
      room.playback = updatedPlayback;

      // Send room state to the newly joined user
      socket.emit('room:joined', { room, isHost: participant.isHost, selfId: socket.id });
      // Notify all other members
      io.to(roomCode).emit('room:state', room);

      callback?.({ success: true, room });
    } catch (err) {
      callback?.({ success: false, error: 'Failed to join room.' });
    }
  });

  // -------------------------------------------------------------
  // 3. Playback Controls (Play, Pause, Seek, Next, Prev)
  // -------------------------------------------------------------
  socket.on('playback:play', (payload: PlaybackControlPayload) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode)!;
    if (!room.playback.currentTrack && room.queue.length > 0) {
      room.playback.currentTrack = room.queue[room.queueIndex] || room.queue[0];
    }
    if (!room.playback.currentTrack) return;

    const now = Date.now();
    const scheduledStart = now + SCHEDULE_DELAY_MS;
    const currentPosition = computeCurrentPosition(room.playback);

    room.playback = {
      status: 'playing',
      currentTrack: room.playback.currentTrack,
      position: currentPosition,
      serverTimestamp: now,
      scheduledStartTime: scheduledStart,
      playbackRate: 1.0,
    };

    io.to(roomCode).emit('playback:sync', room.playback);
  });

  socket.on('playback:pause', (payload: PlaybackControlPayload) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode)!;
    const now = Date.now();
    const pausedPosition = typeof payload?.position === 'number'
      ? payload.position
      : computeCurrentPosition(room.playback);

    room.playback = {
      status: 'paused',
      currentTrack: room.playback.currentTrack,
      position: pausedPosition,
      serverTimestamp: now,
      scheduledStartTime: null,
      playbackRate: 1.0,
    };

    io.to(roomCode).emit('playback:sync', room.playback);
  });

  socket.on('playback:seek', (payload: PlaybackControlPayload) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode)!;
    const targetPos = Math.max(0, Number(payload.position) || 0);
    const now = Date.now();
    const isPlaying = room.playback.status === 'playing';

    room.playback = {
      status: room.playback.status,
      currentTrack: room.playback.currentTrack,
      position: targetPos,
      serverTimestamp: now,
      scheduledStartTime: isPlaying ? now + SCHEDULE_DELAY_MS : null,
      playbackRate: 1.0,
    };

    io.to(roomCode).emit('playback:sync', room.playback);
  });

  // Track finished playing naturally -> auto advance
  socket.on('playback:ended', (payload: { roomCode: string; trackId: string }) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode)!;
    if (room.playback.currentTrack?.id !== payload.trackId) return;

    if (room.queue.length > 0 && room.queueIndex + 1 < room.queue.length) {
      room.queueIndex += 1;
      const nextTrack = room.queue[room.queueIndex];
      const now = Date.now();

      room.playback = {
        status: 'playing',
        currentTrack: nextTrack,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + SCHEDULE_DELAY_MS,
        playbackRate: 1.0,
      };

      io.to(roomCode).emit('room:state', room);
      io.to(roomCode).emit('playback:sync', room.playback);
    } else {
      room.playback = {
        status: 'stopped',
        currentTrack: null,
        position: 0,
        serverTimestamp: Date.now(),
        scheduledStartTime: null,
        playbackRate: 1.0,
      };
      io.to(roomCode).emit('playback:sync', room.playback);
    }
  });

  // -------------------------------------------------------------
  // 4. Queue Management
  // -------------------------------------------------------------
  socket.on('queue:add', (payload: QueueAddPayload) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode) || !payload?.track) return;

    const room = rooms.get(roomCode)!;
    room.queue.push(payload.track);

    // If nothing was playing, play this added track immediately!
    if (!room.playback.currentTrack || room.playback.status === 'stopped') {
      room.queueIndex = room.queue.length - 1;
      const now = Date.now();
      room.playback = {
        status: 'playing',
        currentTrack: payload.track,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + SCHEDULE_DELAY_MS,
        playbackRate: 1.0,
      };
      io.to(roomCode).emit('playback:sync', room.playback);
    }

    io.to(roomCode).emit('room:state', room);
  });

  socket.on('queue:remove', (payload: QueueRemovePayload) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode)!;
    const removeIdx = room.queue.findIndex((t) => t.id === payload.trackId);
    if (removeIdx === -1) return;

    room.queue.splice(removeIdx, 1);
    if (room.queueIndex >= room.queue.length) {
      room.queueIndex = Math.max(0, room.queue.length - 1);
    }

    io.to(roomCode).emit('room:state', room);
  });

  socket.on('queue:skip', (payload: QueueSkipPayload) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode)!;
    const targetIdx = typeof payload?.index === 'number' ? payload.index : room.queueIndex + 1;
    if (targetIdx >= 0 && targetIdx < room.queue.length) {
      room.queueIndex = targetIdx;
      const track = room.queue[targetIdx];
      const now = Date.now();

      room.playback = {
        status: 'playing',
        currentTrack: track,
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + SCHEDULE_DELAY_MS,
        playbackRate: 1.0,
      };

      io.to(roomCode).emit('room:state', room);
      io.to(roomCode).emit('playback:sync', room.playback);
    }
  });

  socket.on('queue:add_multiple', (payload: QueueAddMultiplePayload) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode) || !payload?.tracks?.length) return;

    const room = rooms.get(roomCode)!;
    const wasEmpty = !room.playback.currentTrack || room.playback.status === 'stopped';
    room.queue.push(...payload.tracks);

    if (wasEmpty && room.queue.length > 0) {
      room.queueIndex = room.queue.length - payload.tracks.length;
      const now = Date.now();
      room.playback = {
        status: 'playing',
        currentTrack: payload.tracks[0],
        position: 0,
        serverTimestamp: now,
        scheduledStartTime: now + SCHEDULE_DELAY_MS,
        playbackRate: 1.0,
      };
      io.to(roomCode).emit('playback:sync', room.playback);
    }

    io.to(roomCode).emit('room:state', room);
  });

  socket.on('queue:reorder', (payload: QueueReorderPayload) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode)!;
    const { fromIndex, toIndex } = payload;
    if (fromIndex < 0 || fromIndex >= room.queue.length || toIndex < 0 || toIndex >= room.queue.length) return;

    const [moved] = room.queue.splice(fromIndex, 1);
    room.queue.splice(toIndex, 0, moved);

    if (room.queueIndex === fromIndex) {
      room.queueIndex = toIndex;
    } else if (fromIndex < room.queueIndex && toIndex >= room.queueIndex) {
      room.queueIndex -= 1;
    } else if (fromIndex > room.queueIndex && toIndex <= room.queueIndex) {
      room.queueIndex += 1;
    }

    io.to(roomCode).emit('room:state', room);
  });

  socket.on('room:transfer_host', (payload: AdminTransferPayload) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode)!;
    if (room.hostId !== socket.id) return; // Only current host can transfer

    room.hostId = payload.newHostId;
    room.participants.forEach((p) => {
      p.isHost = p.id === payload.newHostId;
    });

    io.to(roomCode).emit('room:state', room);
  });

  socket.on('room:kick', (payload: KickParticipantPayload) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode)!;
    if (room.hostId !== socket.id) return; // Only host can kick

    const targetSocket = io.sockets.sockets.get(payload.targetUserId);
    if (targetSocket) {
      targetSocket.emit('room:kicked', { reason: 'Removed by host' });
      targetSocket.leave(roomCode);
      socketToRoom.delete(payload.targetUserId);
    }

    room.participants = room.participants.filter((p) => p.id !== payload.targetUserId);
    io.to(roomCode).emit('room:state', room);
  });

  // -------------------------------------------------------------
  // 5. Participant Drift Tracking & Disconnection
  // -------------------------------------------------------------
  socket.on('participant:drift', (payload: DriftReportPayload) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode)!;
    const participant = room.participants.find((p) => p.id === socket.id);
    if (participant) {
      participant.driftMs = Math.round(payload.driftMs || 0);
      io.to(roomCode).emit('participant:updated', participant);
    }
  });

  socket.on('room:leave', (payload: { roomCode?: string }) => {
    const meta = socketToRoom.get(socket.id);
    const roomCode = payload?.roomCode || meta?.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    socket.leave(roomCode);
    socketToRoom.delete(socket.id);

    const room = rooms.get(roomCode)!;
    room.participants = room.participants.filter((p) => p.id !== socket.id);

    if (room.participants.length === 0) {
      const timer = setTimeout(() => {
        rooms.delete(roomCode);
        cleanupTimers.delete(roomCode);
      }, 60_000);
      cleanupTimers.set(roomCode, timer);
    } else {
      if (room.hostId === socket.id) {
        room.participants[0].isHost = true;
        room.hostId = room.participants[0].id;
      }
      io.to(roomCode).emit('room:state', room);
    }
  });

  socket.on('disconnect', () => {
    const meta = socketToRoom.get(socket.id);
    if (!meta) return;

    const { roomCode } = meta;
    socketToRoom.delete(socket.id);

    if (!rooms.has(roomCode)) return;
    const room = rooms.get(roomCode)!;

    room.participants = room.participants.filter((p) => p.id !== socket.id);

    if (room.participants.length === 0) {
      // Room empty: Keep in memory for 60 seconds in case of quick page reload
      const timer = setTimeout(() => {
        rooms.delete(roomCode);
        cleanupTimers.delete(roomCode);
      }, 60_000);
      cleanupTimers.set(roomCode, timer);
    } else {
      // If host left, elect the next oldest participant as host
      if (room.hostId === socket.id) {
        room.participants[0].isHost = true;
        room.hostId = room.participants[0].id;
      }
      io.to(roomCode).emit('room:state', room);
    }
  });
}

