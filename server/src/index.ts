import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { RoomManager } from './room/roomManager.js';
import { MediaResolver, PRESET_TRACKS } from './media/mediaResolver.js';
import { SyncEngine } from './sync/syncEngine.js';
import { UnifiedMediaItem } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Configure CORS and Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 5000
});

app.use(cors());
app.use(express.json());

// Create uploads directory if it does not exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded audio files statically
app.use('/uploads', express.static(uploadsDir));

// Multer storage for audio uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `audio-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB max
  fileFilter: (_req, file, cb) => {
    const allowedMime = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/ogg',
      'audio/aac',
      'audio/flac',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mp4'
    ];
    if (allowedMime.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|ogg|aac|flac|m4a)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files (.mp3, .wav, .ogg, .aac, .m4a, .flac) are allowed.'));
    }
  }
});

const roomManager = new RoomManager();

// --- REST API Endpoints ---

// Health check and server time endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    serverTime: Date.now(),
    service: 'Vybe Synchronization Backend'
  });
});

// Built-in preset demo tracks
app.get('/api/presets', (_req, res) => {
  res.json({
    success: true,
    presets: PRESET_TRACKS
  });
});

// Media resolver endpoint (YouTube, Spotify, Direct URLs)
app.post('/api/resolve-media', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'URL string is required' });
      return;
    }

    const resolved = await MediaResolver.resolve(url.trim());
    res.json({ success: true, data: resolved });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Failed to resolve media URL' });
  }
});

// Audio file upload endpoint
app.post('/api/upload', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No audio file provided' });
      return;
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const resolved = await MediaResolver.resolveDirectAudio(fileUrl, true);
    // Use original clean filename as track title if available
    const originalName = path.parse(req.file.originalname).name.replace(/[_-]/g, ' ');
    resolved.title = originalName.charAt(0).toUpperCase() + originalName.slice(1);

    res.json({
      success: true,
      fileUrl,
      item: resolved
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'File upload failed' });
  }
});

// --- Real-time Socket.IO Connection & Synchronization ---

io.on('connection', (socket) => {
  let currentRoomCode: string | null = null;
  let currentUserId: string | null = null;

  // 1. Clock Synchronization (NTP-style ping/pong)
  socket.on('sync:ping', (data: { clientTime: number }) => {
    socket.emit('sync:pong', {
      clientTime: data.clientTime,
      serverTime: Date.now()
    });
  });

  // 2. Create Room
  socket.on('room:create', (data: { username: string; userId?: string }) => {
    try {
      const roomCode = roomManager.generateUniqueRoomCode();
      const { user, state } = roomManager.createRoom(roomCode, data.username, socket.id, data.userId);

      currentRoomCode = roomCode;
      currentUserId = user.id;

      socket.join(roomCode);
      socket.emit('room:created', { roomCode, user, state });
    } catch (err: any) {
      socket.emit('room:error', { message: err.message || 'Failed to create room' });
    }
  });

  // 3. Join Room (with auto-create fallback per requirements)
  socket.on('room:join', (data: { roomCode: string; username: string; userId?: string }) => {
    try {
      const { roomCode, username, userId } = data;
      const { user, state, isNewRoom, reconnected } = roomManager.joinOrCreateRoom(
        roomCode,
        username,
        socket.id,
        userId
      );

      currentRoomCode = roomCode;
      currentUserId = user.id;

      socket.join(roomCode);

      // Tell the joining client about their state and role
      socket.emit('room:joined', { roomCode, user, state, isNewRoom, reconnected });

      // Notify other room participants
      socket.to(roomCode).emit('room:user_joined', { user });
      io.to(roomCode).emit('room:state', state);
    } catch (err: any) {
      socket.emit('room:error', { message: err.message || 'Failed to join room' });
    }
  });

  // 4. Leave Room
  socket.on('room:leave', (data: { roomCode: string }) => {
    if (!currentUserId || !data.roomCode) return;
    const roomCode = data.roomCode;

    const res = roomManager.leaveRoom(roomCode, currentUserId, (newAdmin) => {
      io.to(roomCode).emit('room:admin_changed', { newAdminId: newAdmin.id, username: newAdmin.username });
    });

    socket.leave(roomCode);
    currentRoomCode = null;

    if (!res.roomClosed) {
      io.to(roomCode).emit('room:user_left', { userId: currentUserId });
      const updatedState = roomManager.getRoomState(roomCode);
      if (updatedState) {
        io.to(roomCode).emit('room:state', updatedState);
      }
    }
  });

  // 5. End Room (Admin Only)
  socket.on('room:end', (data: { roomCode: string }) => {
    try {
      if (!currentUserId || !data.roomCode) return;
      const roomCode = data.roomCode;

      if (!roomManager.isUserAdmin(roomCode, currentUserId)) {
        socket.emit('room:error', { message: 'Only the room ADMIN can end the room.' });
        return;
      }

      roomManager.endRoom(roomCode, currentUserId);
      io.to(roomCode).emit('room:ended', { message: 'The admin has ended this room session.' });
      io.in(roomCode).socketsLeave(roomCode);
      currentRoomCode = null;
    } catch (err: any) {
      socket.emit('room:error', { message: err.message || 'Failed to end room.' });
    }
  });

  // --- Synchronized Playback Actions (Admin Only) ---

  // Helper to verify admin permission on playback commands
  const requireAdmin = (roomCode: string): boolean => {
    if (!currentUserId || !roomManager.isUserAdmin(roomCode, currentUserId)) {
      socket.emit('room:error', { message: 'Permission denied: Only the room ADMIN can control playback and queue.' });
      return false;
    }
    return true;
  };

  // Play
  socket.on('playback:play', (data: { roomCode: string }) => {
    const { roomCode } = data;
    if (!requireAdmin(roomCode)) return;

    const state = roomManager.getRoomState(roomCode);
    if (!state || !state.playback.currentTrack) return;

    const authoritativePos = SyncEngine.calculateAuthoritativePosition(state.playback);
    const newPlayback = SyncEngine.createScheduledState(
      'playing',
      authoritativePos,
      state.playback.currentTrack,
      state.playback.playbackRate || 1.0
    );

    roomManager.updatePlayback(roomCode, newPlayback);
    io.to(roomCode).emit('playback:sync', {
      ...newPlayback,
      serverTime: Date.now()
    });
  });

  // Pause
  socket.on('playback:pause', (data: { roomCode: string }) => {
    const { roomCode } = data;
    if (!requireAdmin(roomCode)) return;

    const state = roomManager.getRoomState(roomCode);
    if (!state || !state.playback.currentTrack) return;

    const authoritativePos = SyncEngine.calculateAuthoritativePosition(state.playback);
    const newPlayback = SyncEngine.createScheduledState(
      'paused',
      authoritativePos,
      state.playback.currentTrack,
      state.playback.playbackRate || 1.0
    );

    roomManager.updatePlayback(roomCode, newPlayback);
    io.to(roomCode).emit('playback:sync', {
      ...newPlayback,
      serverTime: Date.now()
    });
  });

  // Seek
  socket.on('playback:seek', (data: { roomCode: string; position: number }) => {
    const { roomCode, position } = data;
    if (!requireAdmin(roomCode)) return;

    const state = roomManager.getRoomState(roomCode);
    if (!state || !state.playback.currentTrack) return;

    const targetPos = Math.max(0, position);
    const newPlayback = SyncEngine.createScheduledState(
      state.playback.status,
      targetPos,
      state.playback.currentTrack,
      state.playback.playbackRate || 1.0
    );

    roomManager.updatePlayback(roomCode, newPlayback);
    io.to(roomCode).emit('playback:sync', {
      ...newPlayback,
      serverTime: Date.now()
    });
  });

  // Skip to Next Track
  socket.on('playback:next', (data: { roomCode: string }) => {
    const { roomCode } = data;
    if (!requireAdmin(roomCode)) return;

    const state = roomManager.getRoomState(roomCode);
    if (!state || state.queue.length === 0) return;

    let nextIndex = state.currentIndex + 1;
    if (state.settings.isShuffle && state.queue.length > 1) {
      let randIndex = Math.floor(Math.random() * state.queue.length);
      while (randIndex === state.currentIndex && state.queue.length > 1) {
        randIndex = Math.floor(Math.random() * state.queue.length);
      }
      nextIndex = randIndex;
    } else if (nextIndex >= state.queue.length) {
      if (state.settings.repeatMode === 'all') {
        nextIndex = 0;
      } else {
        // Queue reached end, pause at 0 of last track
        const stoppedPlayback = SyncEngine.createScheduledState('paused', 0, state.queue[state.currentIndex]);
        roomManager.updatePlayback(roomCode, stoppedPlayback);
        io.to(roomCode).emit('playback:sync', { ...stoppedPlayback, serverTime: Date.now() });
        return;
      }
    }

    const nextTrack = state.queue[nextIndex];
    state.currentIndex = nextIndex;

    const newPlayback = SyncEngine.createScheduledState(
      'playing',
      0,
      nextTrack,
      1.0
    );

    roomManager.updatePlayback(roomCode, newPlayback);
    roomManager.updateQueue(roomCode, state.queue, nextIndex);

    io.to(roomCode).emit('playback:sync', { ...newPlayback, serverTime: Date.now() });
    io.to(roomCode).emit('queue:updated', { queue: state.queue, currentIndex: nextIndex });
  });

  // Previous Track
  socket.on('playback:prev', (data: { roomCode: string }) => {
    const { roomCode } = data;
    if (!requireAdmin(roomCode)) return;

    const state = roomManager.getRoomState(roomCode);
    if (!state || state.queue.length === 0) return;

    const currentPos = SyncEngine.calculateAuthoritativePosition(state.playback);
    // If track has been playing for more than 3 seconds, restart it; otherwise go to previous
    if (currentPos > 3) {
      const restartedPlayback = SyncEngine.createScheduledState(
        'playing',
        0,
        state.playback.currentTrack,
        1.0
      );
      roomManager.updatePlayback(roomCode, restartedPlayback);
      io.to(roomCode).emit('playback:sync', { ...restartedPlayback, serverTime: Date.now() });
      return;
    }

    let prevIndex = state.currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = state.settings.repeatMode === 'all' ? state.queue.length - 1 : 0;
    }

    const prevTrack = state.queue[prevIndex];
    state.currentIndex = prevIndex;

    const newPlayback = SyncEngine.createScheduledState('playing', 0, prevTrack, 1.0);
    roomManager.updatePlayback(roomCode, newPlayback);
    roomManager.updateQueue(roomCode, state.queue, prevIndex);

    io.to(roomCode).emit('playback:sync', { ...newPlayback, serverTime: Date.now() });
    io.to(roomCode).emit('queue:updated', { queue: state.queue, currentIndex: prevIndex });
  });

  // Track Ended (Automatic progression)
  socket.on('playback:track_ended', (data: { roomCode: string; trackId: string }) => {
    const { roomCode, trackId } = data;
    const state = roomManager.getRoomState(roomCode);
    if (!state || !state.playback.currentTrack || state.playback.currentTrack.id !== trackId) return;

    // Check repeat mode
    if (state.settings.repeatMode === 'one') {
      const loopedPlayback = SyncEngine.createScheduledState('playing', 0, state.playback.currentTrack, 1.0);
      roomManager.updatePlayback(roomCode, loopedPlayback);
      io.to(roomCode).emit('playback:sync', { ...loopedPlayback, serverTime: Date.now() });
      return;
    }

    // Advance to next track
    let nextIndex = state.currentIndex + 1;
    if (state.settings.isShuffle && state.queue.length > 1) {
      nextIndex = Math.floor(Math.random() * state.queue.length);
    } else if (nextIndex >= state.queue.length) {
      if (state.settings.repeatMode === 'all') {
        nextIndex = 0;
      } else {
        const endedPlayback = SyncEngine.createScheduledState('paused', 0, state.queue[state.currentIndex]);
        roomManager.updatePlayback(roomCode, endedPlayback);
        io.to(roomCode).emit('playback:sync', { ...endedPlayback, serverTime: Date.now() });
        return;
      }
    }

    const nextTrack = state.queue[nextIndex];
    state.currentIndex = nextIndex;
    const nextPlayback = SyncEngine.createScheduledState('playing', 0, nextTrack, 1.0);

    roomManager.updatePlayback(roomCode, nextPlayback);
    roomManager.updateQueue(roomCode, state.queue, nextIndex);

    io.to(roomCode).emit('playback:sync', { ...nextPlayback, serverTime: Date.now() });
    io.to(roomCode).emit('queue:updated', { queue: state.queue, currentIndex: nextIndex });
  });

  // Client Drift & Ping Report
  socket.on('playback:drift_report', (data: { roomCode: string; drift: number; ping: number }) => {
    const { roomCode, drift, ping } = data;
    roomManager.updateClientMetrics(roomCode, socket.id, drift, ping);
  });

  // --- Queue Management (Admin Only) ---

  // Add Item to Queue
  socket.on('queue:add', (data: { roomCode: string; item: any }) => {
    const { roomCode, item } = data;
    if (!requireAdmin(roomCode)) return;

    const state = roomManager.getRoomState(roomCode);
    if (!state) return;

    const currentUser = state.users.find(u => u.id === currentUserId);
    const newItem: UnifiedMediaItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      provider: item.provider,
      mediaId: item.mediaId,
      url: item.url,
      title: item.title,
      artist: item.artist,
      thumbnail: item.thumbnail,
      duration: item.duration || 180,
      isPlayable: item.isPlayable !== false,
      unavailabilityReason: item.unavailabilityReason,
      album: item.album,
      addedBy: currentUser ? currentUser.username : 'Admin',
      addedAt: Date.now()
    };

    state.queue.push(newItem);

    // If no song was playing or queue was empty, set this as the active track
    if (!state.playback.currentTrack) {
      state.currentIndex = 0;
      const scheduledState = SyncEngine.createScheduledState('playing', 0, newItem);
      roomManager.updatePlayback(roomCode, scheduledState);
      io.to(roomCode).emit('playback:sync', { ...scheduledState, serverTime: Date.now() });
    }

    roomManager.updateQueue(roomCode, state.queue, state.currentIndex);
    io.to(roomCode).emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
  });

  // Remove Item from Queue
  socket.on('queue:remove', (data: { roomCode: string; itemId: string }) => {
    const { roomCode, itemId } = data;
    if (!requireAdmin(roomCode)) return;

    const state = roomManager.getRoomState(roomCode);
    if (!state) return;

    const removeIndex = state.queue.findIndex(item => item.id === itemId);
    if (removeIndex === -1) return;

    state.queue.splice(removeIndex, 1);

    if (removeIndex < state.currentIndex) {
      state.currentIndex = Math.max(0, state.currentIndex - 1);
    } else if (removeIndex === state.currentIndex) {
      if (state.queue.length > 0) {
        state.currentIndex = state.currentIndex % state.queue.length;
        const nextTrack = state.queue[state.currentIndex];
        const newPlayback = SyncEngine.createScheduledState('playing', 0, nextTrack);
        roomManager.updatePlayback(roomCode, newPlayback);
        io.to(roomCode).emit('playback:sync', { ...newPlayback, serverTime: Date.now() });
      } else {
        state.currentIndex = 0;
        const emptyPlayback = SyncEngine.createScheduledState('stopped', 0, null);
        roomManager.updatePlayback(roomCode, emptyPlayback);
        io.to(roomCode).emit('playback:sync', { ...emptyPlayback, serverTime: Date.now() });
      }
    }

    roomManager.updateQueue(roomCode, state.queue, state.currentIndex);
    io.to(roomCode).emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
  });

  // Reorder Queue
  socket.on('queue:reorder', (data: { roomCode: string; startIndex: number; endIndex: number }) => {
    const { roomCode, startIndex, endIndex } = data;
    if (!requireAdmin(roomCode)) return;

    const state = roomManager.getRoomState(roomCode);
    if (!state) return;

    if (
      startIndex < 0 ||
      startIndex >= state.queue.length ||
      endIndex < 0 ||
      endIndex >= state.queue.length
    ) {
      return;
    }

    const [moved] = state.queue.splice(startIndex, 1);
    state.queue.splice(endIndex, 0, moved);

    // Keep currentIndex tracking the current track
    if (state.currentIndex === startIndex) {
      state.currentIndex = endIndex;
    } else if (startIndex < state.currentIndex && endIndex >= state.currentIndex) {
      state.currentIndex--;
    } else if (startIndex > state.currentIndex && endIndex <= state.currentIndex) {
      state.currentIndex++;
    }

    roomManager.updateQueue(roomCode, state.queue, state.currentIndex);
    io.to(roomCode).emit('queue:updated', { queue: state.queue, currentIndex: state.currentIndex });
  });

  // Clear Queue
  socket.on('queue:clear', (data: { roomCode: string }) => {
    const { roomCode } = data;
    if (!requireAdmin(roomCode)) return;

    const state = roomManager.getRoomState(roomCode);
    if (!state) return;

    // Retain currently playing track as item 0 if playing, clear the rest
    if (state.playback.currentTrack) {
      state.queue = [state.playback.currentTrack];
      state.currentIndex = 0;
    } else {
      state.queue = [];
      state.currentIndex = 0;
    }

    roomManager.updateQueue(roomCode, state.queue, 0);
    io.to(roomCode).emit('queue:updated', { queue: state.queue, currentIndex: 0 });
  });

  // Play Specific Queue Item by Index
  socket.on('queue:play_index', (data: { roomCode: string; index: number }) => {
    const { roomCode, index } = data;
    if (!requireAdmin(roomCode)) return;

    const state = roomManager.getRoomState(roomCode);
    if (!state || index < 0 || index >= state.queue.length) return;

    state.currentIndex = index;
    const selectedTrack = state.queue[index];

    const newPlayback = SyncEngine.createScheduledState('playing', 0, selectedTrack);
    roomManager.updatePlayback(roomCode, newPlayback);
    roomManager.updateQueue(roomCode, state.queue, index);

    io.to(roomCode).emit('playback:sync', { ...newPlayback, serverTime: Date.now() });
    io.to(roomCode).emit('queue:updated', { queue: state.queue, currentIndex: index });
  });

  // Room Settings (Repeat, Shuffle, Shared Volume)
  socket.on('settings:update', (data: { roomCode: string; settings: any }) => {
    const { roomCode, settings } = data;
    if (!requireAdmin(roomCode)) return;

    const updated = roomManager.updateSettings(roomCode, settings);
    io.to(roomCode).emit('settings:updated', updated);
  });

  // Disconnection handling
  socket.on('disconnect', () => {
    if (currentRoomCode) {
      const roomCode = currentRoomCode;
      roomManager.handleUserDisconnect(socket.id, (code, user, promotedAdmin) => {
        // Callback after grace period expired permanently
        io.to(code).emit('room:user_left', { userId: user.id, username: user.username });
        if (promotedAdmin) {
          io.to(code).emit('room:admin_changed', { newAdminId: promotedAdmin.id, username: promotedAdmin.username });
        }
        const state = roomManager.getRoomState(code);
        if (state) {
          io.to(code).emit('room:state', state);
        }
      });

      // Temporarily mark as offline in real-time
      const state = roomManager.getRoomState(roomCode);
      if (state) {
        io.to(roomCode).emit('room:state', state);
      }
    }
  });
});

// Serve client build if available (for all-in-one deployments on Render, Railway, VPS)
const clientDistPath = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Vybe Synchronization Server running on http://localhost:${PORT}`);
});

