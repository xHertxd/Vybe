import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { config } from './config.js';
import type { MediaItemInput } from './types.js';
import { MediaResolver, PRESET_TRACKS } from './media/mediaResolver.js';
import { MediaSynchronizationEngine } from './sync/mediaSynchronizationEngine.js';
import { RoomManager, RoomError } from './room/roomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Session {
  roomCode: string;
  userId: string;
  sessionToken: string;
}

function errorPayload(error: unknown): { message: string; code: string } {
  if (error instanceof RoomError) {
    return { message: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { message: error.message, code: 'ERROR' };
  }
  return { message: 'Something went wrong.', code: 'ERROR' };
}

export function createVybeServer() {
  const app = express();
  const server = http.createServer(app);

  const allowedOrigin = config.allowedOrigins || true;
  const io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigin,
      methods: ['GET', 'POST'],
    },
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 1e6,
    path: process.env.SOCKET_PATH || '/socket.io',
  });

  app.use(
    cors({
      origin: allowedOrigin,
      methods: ['GET', 'POST', 'OPTIONS'],
    })
  );
  app.use(express.json({ limit: '1mb' }));

  const mediaResolver = new MediaResolver(
    config.youtubeApiKey,
    config.spotifyClientId,
    config.spotifyClientSecret
  );
  const syncEngine = new MediaSynchronizationEngine(config.scheduleDelayMs);
  const roomManager = new RoomManager(syncEngine, {
    disconnectGraceMs: config.disconnectGraceMs,
    maxUsersPerRoom: config.maxUsersPerRoom,
    maxQueueLength: config.maxQueueLength,
  });

  // ---------------------------------------------------------------------------
  // Uploads
  // ---------------------------------------------------------------------------

  const uploadsDir = process.env.VERCEL
    ? path.join('/tmp', 'vybe-uploads')
    : path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir, { maxAge: '1h' }));

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `vybe-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
      },
    }),
    limits: { fileSize: config.uploadMaxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      const allowed =
        /^audio\//i.test(file.mimetype) ||
        /\.(mp3|wav|ogg|oga|aac|m4a|flac|opus|webm)$/i.test(file.originalname);
      if (allowed) cb(null, true);
      else cb(new Error('Please upload an audio file (MP3, WAV, OGG, M4A, FLAC).'));
    },
  });

  // ---------------------------------------------------------------------------
  // REST API
  // ---------------------------------------------------------------------------

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'Vybe',
      serverTime: Date.now(),
      capabilities: mediaResolver.capabilities(),
      rooms: roomManager.getRoomCodes().length,
    });
  });

  app.get('/api/presets', (_req, res) => {
    res.json({
      success: true,
      presets: PRESET_TRACKS.map((preset) => ({ ...preset, isPlayable: true })),
    });
  });

  app.post('/api/resolve-media', async (req, res) => {
    try {
      const { url } = req.body as { url?: unknown };
      if (typeof url !== 'string' || !url.trim()) {
        res.status(400).json({ success: false, error: 'A media URL is required.' });
        return;
      }
      const data = await mediaResolver.resolve(url.trim());
      res.json({ success: true, data });
    } catch (error) {
      res.status(400).json({ success: false, error: errorPayload(error).message });
    }
  });

  app.post('/api/upload', upload.single('audio'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No audio file was uploaded.' });
      return;
    }

    const publicPath = `/uploads/${req.file.filename}`;
    const item = mediaResolver.resolveUploadedFile(req.file.originalname, publicPath);

    res.json({
      success: true,
      fileUrl: publicPath,
      item,
    });
  });

  app.use(
    (
      error: Error & { code?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(400).json({ success: false, error: error.message || 'Upload failed.' });
    }
  );

  // ---------------------------------------------------------------------------
  // Live room events
  // ---------------------------------------------------------------------------

  const sessions = new Map<string, Session>();

  roomManager.setHooks({
    playbackSync: (roomCode, playback) => {
      io.to(roomCode).emit('playback:sync', {
        ...playback,
        serverTime: Date.now(),
      });
    },
    roomUpdated: (roomCode, state) => {
      io.to(roomCode).emit('room:state', state);
    },
    queueUpdated: (roomCode, queue, currentIndex) => {
      io.to(roomCode).emit('queue:updated', { queue, currentIndex });
    },
    adminChanged: (roomCode, admin) => {
      io.to(roomCode).emit('room:admin_changed', {
        newAdminId: admin.id,
        username: admin.username,
      });
    },
    roomClosed: (roomCode, reason) => {
      if (reason === 'ended' || reason === 'expired') {
        io.to(roomCode).emit('room:ended', {
          reason,
          message:
            reason === 'ended'
              ? 'The admin ended this room.'
              : 'This room expired while everyone was away.',
        });
      }
      io.in(roomCode).socketsLeave(roomCode);
      for (const [socketId, session] of sessions) {
        if (session.roomCode === roomCode) sessions.delete(socketId);
      }
    },
  });

  function getSession(socket: Socket): Session | null {
    return sessions.get(socket.id) ?? null;
  }

  function requireSession(socket: Socket, roomCode?: string): Session {
    const session = getSession(socket);
    if (!session) throw new RoomError('Join a room first.', 'FORBIDDEN');
    if (roomCode && session.roomCode !== roomCode) {
      throw new RoomError('You are not connected to that room.', 'FORBIDDEN');
    }
    return session;
  }

  function emitError(socket: Socket, error: unknown): void {
    socket.emit('room:error', errorPayload(error));
  }

  function leaveOldRoom(socket: Socket, notify = true): void {
    const session = getSession(socket);
    if (!session) return;
    sessions.delete(socket.id);
    const result = roomManager.leaveRoom(session.roomCode, session.userId);
    socket.leave(session.roomCode);
    if (notify && !result.roomClosed) {
      socket.to(session.roomCode).emit('room:user_left', {
        userId: session.userId,
      });
    }
  }

  function attachSession(
    socket: Socket,
    roomCode: string,
    userId: string,
    sessionToken: string
  ): void {
    sessions.set(socket.id, { roomCode, userId, sessionToken });
    socket.join(roomCode);
  }

  io.on('connection', (socket) => {
    socket.emit('server:hello', { serverTime: Date.now(), socketId: socket.id });

    socket.on('sync:ping', (payload: { clientTime?: number } = {}) => {
      socket.emit('sync:pong', {
        clientTime: typeof payload.clientTime === 'number' ? payload.clientTime : Date.now(),
        serverTime: Date.now(),
      });
    });

    // -- Room entry -----------------------------------------------------------

    socket.on('room:create', (payload: { username?: string; userId?: string } = {}) => {
      try {
        leaveOldRoom(socket);
        const roomCode = roomManager.generateUniqueRoomCode();
        const result = roomManager.createRoom(
          roomCode,
          payload.username || '',
          socket.id,
          payload.userId
        );
        attachSession(socket, roomCode, result.user.id, result.sessionToken);
        socket.emit('room:created', {
          roomCode,
          user: result.user,
          state: result.state,
          sessionToken: result.sessionToken,
        });
        io.to(roomCode).emit('room:state', result.state);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on(
      'room:join',
      (payload: { roomCode?: string; username?: string; userId?: string; sessionToken?: string } = {}) => {
        try {
          const roomCode = payload.roomCode || '';
          if (!roomManager.isValidRoomCode(roomCode)) {
            throw new RoomError('Enter a valid 6-digit room code.', 'VALIDATION');
          }

          const existing = getSession(socket);
          if (existing?.roomCode === roomCode) {
            const state = roomManager.getState(roomCode);
            if (state) {
              socket.emit('room:joined', {
                roomCode,
                user: state.users.find((user) => user.id === existing.userId),
                state,
                sessionToken: existing.sessionToken,
                reconnected: true,
              });
              return;
            }
          }

          leaveOldRoom(socket);
          const result = roomManager.joinOrCreateRoom(
            roomCode,
            payload.username || '',
            socket.id,
            payload.userId,
            payload.sessionToken
          );
          attachSession(socket, roomCode, result.user.id, result.sessionToken);

          socket.emit('room:joined', {
            roomCode,
            user: result.user,
            state: roomManager.getState(roomCode) || result.state,
            isNewRoom: result.isNewRoom,
            reconnected: result.reconnected,
            sessionToken: result.sessionToken,
          });
          socket.to(roomCode).emit('room:user_joined', { user: result.user });
          io.to(roomCode).emit('room:state', roomManager.getState(roomCode) || result.state);
        } catch (error) {
          emitError(socket, error);
        }
      }
    );

    socket.on(
      'room:resume',
      (payload: { roomCode?: string; userId?: string; sessionToken?: string; username?: string } = {}) => {
        try {
          const roomCode = payload.roomCode || '';
          const userId = payload.userId || '';
          const sessionToken = payload.sessionToken || '';
          if (!roomCode || !userId || !sessionToken) {
            throw new RoomError('No resumable session was found.', 'EXPIRED');
          }

          const existing = getSession(socket);
          if (existing?.roomCode === roomCode) {
            const state = roomManager.getState(roomCode);
            if (!state) throw new RoomError('That room is no longer active.', 'EXPIRED');
            socket.emit('room:joined', {
              roomCode,
              user: state.users.find((user) => user.id === existing.userId),
              state,
              sessionToken: existing.sessionToken,
              reconnected: true,
            });
            return;
          }

          leaveOldRoom(socket);
          const result = roomManager.resumeRoom(
            roomCode,
            userId,
            sessionToken,
            socket.id,
            payload.username
          );
          attachSession(socket, roomCode, result.user.id, sessionToken);
          socket.join(roomCode);
          socket.emit('room:joined', {
            roomCode,
            user: result.user,
            state: result.state,
            sessionToken,
            reconnected: true,
          });
          socket.to(roomCode).emit('room:user_joined', { user: result.user });
          io.to(roomCode).emit('room:state', result.state);
        } catch (error) {
          emitError(socket, error);
          if ((error as RoomError).code === 'EXPIRED') {
            socket.emit('room:expired');
          }
        }
      }
    );

    socket.on('room:leave', (payload: { roomCode?: string } = {}) => {
      try {
        const session = requireSession(socket, payload.roomCode);
        const result = roomManager.leaveRoom(session.roomCode, session.userId);
        sessions.delete(socket.id);
        socket.leave(session.roomCode);
        if (!result.roomClosed) {
          socket.to(session.roomCode).emit('room:user_left', { userId: session.userId });
        }
        socket.emit('room:left');
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('room:end', (payload: { roomCode?: string } = {}) => {
      try {
        const session = requireSession(socket, payload.roomCode);
        roomManager.endRoom(session.roomCode, session.userId);
        sessions.delete(socket.id);
      } catch (error) {
        emitError(socket, error);
      }
    });

    // -- Playback -------------------------------------------------------------

    function playbackAction(
      socket: Socket,
      payload: { roomCode?: string } = {},
      action: (session: Session) => void
    ): void {
      try {
        const session = requireSession(socket, payload.roomCode);
        action(session);
      } catch (error) {
        emitError(socket, error);
      }
    }

    socket.on('playback:play', (payload = {}) => {
      playbackAction(socket, payload, (session) => {
        roomManager.play(session.roomCode, session.userId);
      });
    });

    socket.on('playback:pause', (payload = {}) => {
      playbackAction(socket, payload, (session) => {
        roomManager.pause(session.roomCode, session.userId);
      });
    });

    socket.on('playback:seek', (payload: { roomCode?: string; position?: number } = {}) => {
      playbackAction(socket, payload, (session) => {
        roomManager.seek(session.roomCode, session.userId, Number(payload.position));
      });
    });

    socket.on('playback:next', (payload = {}) => {
      playbackAction(socket, payload, (session) => {
        roomManager.next(session.roomCode, session.userId);
      });
    });

    socket.on('playback:prev', (payload = {}) => {
      playbackAction(socket, payload, (session) => {
        roomManager.previous(session.roomCode, session.userId);
      });
    });

    socket.on(
      'playback:track_ended',
      (payload: { roomCode?: string; trackId?: string } = {}) => {
        try {
          const session = requireSession(socket, payload.roomCode);
          if (payload.trackId) {
            roomManager.completeTrack(session.roomCode, payload.trackId, session.userId);
          }
        } catch (error) {
          emitError(socket, error);
        }
      }
    );

    socket.on(
      'playback:drift_report',
      (payload: { roomCode?: string; drift?: number; ping?: number } = {}) => {
        try {
          const session = requireSession(socket, payload.roomCode);
          roomManager.updateUserMetrics(
            session.roomCode,
            session.userId,
            Number(payload.drift) || 0,
            Number(payload.ping) || 0
          );
        } catch {
          // Metrics are best-effort.
        }
      }
    );

    socket.on(
      'media:duration',
      (payload: { roomCode?: string; itemId?: string; duration?: number } = {}) => {
        try {
          const session = requireSession(socket, payload.roomCode);
          if (payload.itemId) {
            roomManager.updateTrackDuration(
              session.roomCode,
              payload.itemId,
              Number(payload.duration),
              session.userId
            );
          }
        } catch {
          // Best-effort metadata improvement.
        }
      }
    );

    // -- Queue ----------------------------------------------------------------

    socket.on(
      'queue:add',
      (payload: { roomCode?: string; item?: MediaItemInput; items?: MediaItemInput[] } = {}) => {
        playbackAction(socket, payload, (session) => {
          const items = Array.isArray(payload.items)
            ? payload.items
            : payload.item
              ? [payload.item]
              : [];
          roomManager.addMedia(session.roomCode, session.userId, items);
        });
      }
    );

    socket.on('queue:remove', (payload: { roomCode?: string; itemId?: string } = {}) => {
      playbackAction(socket, payload, (session) => {
        if (!payload.itemId) throw new RoomError('No queue item was specified.', 'VALIDATION');
        roomManager.removeMedia(session.roomCode, session.userId, payload.itemId);
      });
    });

    socket.on(
      'queue:reorder',
      (payload: {
        roomCode?: string;
        fromIndex?: number;
        toIndex?: number;
        startIndex?: number;
        endIndex?: number;
      } = {}
    ) => {
      playbackAction(socket, payload, (session) => {
        const from = payload.fromIndex ?? payload.startIndex;
        const to = payload.toIndex ?? payload.endIndex;
        roomManager.reorderQueue(
          session.roomCode,
          session.userId,
          Number(from),
          Number(to)
        );
      });
    });

    socket.on('queue:clear', (payload = {}) => {
      playbackAction(socket, payload, (session) => {
        roomManager.clearQueue(session.roomCode, session.userId);
      });
    });

    socket.on('queue:play_index', (payload: { roomCode?: string; index?: number } = {}) => {
      playbackAction(socket, payload, (session) => {
        roomManager.playIndex(session.roomCode, session.userId, Number(payload.index));
      });
    });

    socket.on(
      'settings:update',
      (payload: { roomCode?: string; settings?: Record<string, unknown> } = {}) => {
        playbackAction(socket, payload, (session) => {
          roomManager.updateSettings(
            session.roomCode,
            session.userId,
            (payload.settings || {}) as never
          );
        });
      }
    );

    // -- Disconnect -----------------------------------------------------------

    socket.on('disconnect', () => {
      const session = sessions.get(socket.id);
      sessions.delete(socket.id);

      roomManager.markDisconnected(socket.id, (roomCode, userId, promotedAdmin) => {
        io.to(roomCode).emit('room:user_left', { userId });
        if (promotedAdmin) {
          io.to(roomCode).emit('room:admin_changed', {
            newAdminId: promotedAdmin.id,
            username: promotedAdmin.username,
          });
        }
        const state = roomManager.getState(roomCode);
        if (state) io.to(roomCode).emit('room:state', state);
      });

      if (session) {
        // Presence snapshot is emitted by markDisconnected above.
      }
    });
  });

  // Authoritative heartbeat keeps long sessions honest without relying on
  // client reports. Clients only correct when outside their drift tolerance.
  const heartbeat = setInterval(() => {
    for (const roomCode of roomManager.getRoomCodes()) {
      const snapshot = roomManager.heartbeatSnapshot(roomCode);
      if (snapshot?.status === 'playing' && snapshot.currentTrack) {
        io.to(roomCode).emit('playback:heartbeat', snapshot);
      }
    }
  }, config.heartbeatIntervalMs);
  heartbeat.unref?.();

  const cleanup = setInterval(() => {
    roomManager.purgeIdleRooms(config.roomIdleTimeoutMs);
  }, 5 * 60_000);
  cleanup.unref?.();

  // Serve a production client build when running as one Node process.
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/uploads') ||
        req.path.startsWith('/socket.io')
      ) {
        return next();
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return { app, server, io, roomManager, mediaResolver };
}

export type VybeServer = ReturnType<typeof createVybeServer>;
