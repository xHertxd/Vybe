import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import { setupNtpHandler } from './ntp.js';
import { setupRelayHandlers } from './relay.js';
import freetouseRouter from './freetouse.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS configuration - allows all origins for seamless client connection
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);
app.use(express.json());

// Socket.IO Server configuration with low latency
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10_000,
  pingTimeout: 5_000,
  transports: ['websocket', 'polling'],
});

// Health check endpoint for Render, Docker & monitoring
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Vybe In-Memory Relay',
    serverTime: Date.now(),
    uptime: process.uptime(),
  });
});

// FreeToUse & Audio proxy router
app.use('/api/freetouse', freetouseRouter);

// Socket.IO Connection Setup
io.on('connection', (socket) => {
  // Ultra-low-latency NTP time synchronization
  setupNtpHandler(socket);

  // In-memory room and playback state relay
  setupRelayHandlers(io, socket);
});

const PORT = Number(process.env.PORT) || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Vybe Relay] Server listening on port ${PORT}`);
});

