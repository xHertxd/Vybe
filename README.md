# Vybe

**Real-time synchronized music listening across devices.** One beat. Every device.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

Vybe lets you create or join rooms where everyone hears the exact same music at the exact same time. Whether it's YouTube, Spotify, uploaded audio, or FreeToUse royalty-free tracks — playback is server-authoritative and sample-accurate across all connected devices.

## Features

### Perfect Synchronization
- **Server-authoritative playback clock** — single source of truth for position, rate, and status
- **NTP-style clock sync** — Huygens algorithm with median filtering for sub-millisecond precision
- **Instant start** — scheduled actions with zero delay (configurable)
- **Adaptive drift correction** — exponential smoothing + rate adjustment (1.03x/0.97x catch-up, 1.015x/0.985x micro-trim)
- **Instant resync broadcast** — force-sync all devices on seek/pause/play
- **Reconnection resilience** — 30-minute grace period preserves your seat and username

### Multi-Source Music Library
- **FreeToUse** — high-quality royalty-free direct audio streams (instant start, zero ads)
- **YouTube** — videos, Shorts, Music, playlists via IFrame API (full-length, no 30s limit)
- **Spotify** — Web API metadata + Playback SDK (requires Premium OAuth per listener)
- **Direct audio URLs** — MP3, WAV, OGG, M4A, FLAC, Opus, WebM
- **Uploads** — drag & drop audio files (30MB max), stored and searchable

### Room Controls
- **Admin-only** playback, queue, settings, end room
- **Flexible permissions** — "Everyone" or "Host only" playback control
- **DJ Automix** — automatic crossfade (configurable 0-8s)
- **Queue management** — reorder, remove, play now, play next
- **Repeat modes** — off, all, one
- **Shuffle**

### Modern UX
- **Music Library** — search (FreeToUse + YouTube), categories (Trending, Chill, Electronic, Ambient, Lofi, Cinematic, My Uploads)
- **Theater mode** — immersive full-screen artwork
- **Volume per device** — local volume, global sync
- **Media Session API** — lockscreen/notification controls on mobile
- **Keyboard shortcuts** — Space (play/pause), Arrow keys (seek)
- **Dark theme** — clean, minimal, professional

## Architecture

```
vybe/
├── client/          # React + Vite + TypeScript
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── hooks/         # useMediaPlayer, useRoomSession
│   │   ├── services/      # socket, clockSync, players, audioUnlocker
│   │   ├── lib/           # playback math, formatters
│   │   └── pages/         # RoomEntry, MusicRoom
├── server/          # Node.js + Express + Socket.IO + TypeScript
│   ├── src/
│   │   ├── room/          # RoomManager, MediaSynchronizationEngine
│   │   ├── sync/          # NTP clock sync
│   │   ├── media/         # YouTube, Spotify, upload resolvers
│   │   └── services/      # FreeToUse API client
├── packages/shared/ # Shared types & constants
└── vercel.json      # Vercel deployment config
```

### Sync Engine (Server)
- `MediaSynchronizationEngine` — canonical `positionAt(state, now)` math
- `scheduledStartTime` — future-dated play commands so all clients buffer then start together
- `heartbeat` — 5s authoritative snapshots to all clients
- `forceSync` — instant resync broadcast on demand

### Sync Engine (Client)
- `clockSync` — NTP ping/pong with burst (5 samples) + median filtering
- `useMediaPlayer` — adapter pattern (Howler, YouTube IFrame, Spotify SDK, HTML5 Audio)
- 250ms drift detection loop — seeks only on >1.2s desync, otherwise rate correction
- Audio unlock on first user gesture (iOS Safari compatible)

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm (or npm/yarn)

### Environment Variables

**Server** (`.env` in `/server`):
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173
SYNC_SCHEDULE_DELAY_MS=0
SYNC_HEARTBEAT_MS=5000
DISCONNECT_GRACE_MS=1800000
UPLOAD_MAX_BYTES=31457280
YOUTUBE_API_KEY=your_key_here
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

**Client** (`.env` in `/client`):
```env
VITE_SERVER_URL=http://localhost:5000
VITE_SPOTIFY_CLIENT_ID=your_client_id
```

### Development

```bash
# Install dependencies
pnpm install

# Start server (terminal 1)
cd server && pnpm dev

# Start client (terminal 2)
cd client && pnpm dev
```

Open `http://localhost:5173` — enter a username, create/join a 6-digit room.

### Production Build

```bash
# Build both
pnpm build

# Server runs on PORT (default 5000)
# Client builds to client/dist/
# For Vercel: deploy client/ as static site, run server separately on a Node host (Railway, Render, Fly.io)
```

## Deployment

### Vercel (Client only)
- Connect `client/` folder
- Framework: Vite
- Build: `pnpm build`
- Output: `dist`

### Persistent Node Host (Server)
Required for WebSockets and in-memory room state.
- Railway, Render, Fly.io, or any VPS
- Set environment variables
- Run `pnpm start` from `/server`

**Note**: For multi-instance deployments, replace in-memory `RoomManager` with Redis-backed state.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |
| GET | `/api/search?q=query&limit=20` | Search FreeToUse + YouTube + uploads |
| GET | `/api/library/trending?limit=20` | Trending tracks |
| GET | `/api/library/categories` | FreeToUse categories |
| GET | `/api/library/category/:id?limit=20` | Tracks by category |
| GET | `/api/library/uploads?limit=20&q=query` | Search uploaded tracks |
| POST | `/api/upload` | Upload audio file (multipart) |
| POST | `/api/resolve-media` | Resolve URL to metadata |

## Socket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `room:create` | `{ username }` | Create new room |
| `room:join` | `{ roomCode, username, userId?, sessionToken? }` | Join or auto-create room |
| `room:resume` | `{ roomCode, userId, sessionToken, username? }` | Reconnect after disconnect |
| `room:leave` | `{ roomCode }` | Leave room |
| `room:end` | `{ roomCode }` | End room (admin) |
| `room:claim_admin` | `{ roomCode }` | Claim host if absent |
| `queue:add` | `{ roomCode, items: MediaItemInput[] }` | Add to queue |
| `queue:play_now` | `{ roomCode, item }` | Play immediately |
| `queue:play_index` | `{ roomCode, index }` | Play queue index |
| `queue:reorder` | `{ roomCode, fromIndex, toIndex }` | Reorder queue |
| `queue:remove` | `{ roomCode, itemId }` | Remove from queue |
| `queue:clear` | `{ roomCode }` | Clear queue |
| `playback:play` | `{ roomCode }` | Start playback |
| `playback:pause` | `{ roomCode }` | Pause playback |
| `playback:seek` | `{ roomCode, position }` | Seek to position |
| `playback:next` | `{ roomCode }` | Next track |
| `playback:prev` | `{ roomCode }` | Previous track |
| `playback:force_sync` | `{ roomCode }` | Force resync all |
| `settings:update` | `{ roomCode, settings }` | Update room settings |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `room:created` | `{ roomCode, user, state, sessionToken }` | Room created |
| `room:joined` | `{ roomCode, user, state, sessionToken, reconnected, isNewRoom }` | Joined room |
| `room:state` | `RoomState` | Full room state |
| `room:user_joined` | `{ user }` | User joined |
| `room:user_left` | `{ userId }` | User left |
| `room:admin_changed` | `{ newAdminId, username }` | Admin changed |
| `room:ended` | `{ reason, message }` | Room ended |
| `room:expired` | — | Session expired |
| `playback:sync` | `PlaybackState` | Playback update |
| `playback:heartbeat` | `PlaybackState` | Periodic snapshot |
| `playback:instant_sync` | `{ position, serverTimestamp }` | Force resync |
| `queue:updated` | `{ queue, currentIndex }` | Queue changed |
| `room:error` | `{ message, code }` | Error |

## License

MIT License — see [LICENSE](LICENSE) for details.

## Credits

Built by [Hertx](https://xhertxd.me)

- **FreeToUse** — royalty-free music API
- **YouTube IFrame API** — video playback
- **Spotify Web API / Playback SDK** — metadata & Premium playback
- **Howler.js** — audio engine
- **Socket.IO** — real-time communication

---

**Vybe** — One beat. Every device.