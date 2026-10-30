# Vybe 🎵
> **One Beat. Every Device.**  
> Modern, real-time, multi-device synchronized music & media web application.

Vybe allows multiple devices to connect to the same room using a unique 6-digit numeric room code. When the host/admin plays, pauses, resumes, skips, or seeks a track, the same action happens across every connected participant as simultaneously as technically possible.

---

## ⚡ Core Features

- **Strict Two-Page Architecture**:
  - **Page 1: Room Entry Page (`/`)**:
    - "Create Room" generates a unique 6-digit room code; creator automatically becomes **ADMIN**.
    - "Join Room" with 6-digit numeric input and alphabetic username validation (A–Z, a–z).
    - Intelligent auto-create fallback: If a typed 6-digit room code does not exist, it is automatically created and the user becomes ADMIN.
    - Case-insensitive username uniqueness within each room.
    - Real-time animated canvas waveform visualizer.
  - **Page 2: Music Room**:
    - **ADMIN**: Controls play/pause, seek, previous/next, shuffle, repeat mode, master volume, queue reordering/removal, and ending the room.
    - **USER**: Synchronized listening, artwork/video viewing, upcoming queue inspection, participant list with real-time ping/drift metrics, local volume control, and leave room.
    - Non-admin participants cannot tamper with shared playback or queue.

- **Sub-100ms Synchronization Engine**:
  - **Server-Authoritative State**: authoritative playback timestamp and position computed continuously.
  - **NTP-Style Clock Synchronization**: bidirectional ping/pong measuring Round Trip Time (RTT) and smoothing clock offset ($\Delta$) via median filtering.
  - **Scheduled Future Playback**: Actions trigger with a future start timestamp ($now + 250\text{ms}$), allowing all devices to pre-buffer and start in phase-locked unison.
  - **Two-Tier Drift Compensation**:
    - *Micro-drift (40ms – 350ms)*: Inaudible playback rate nudges (1.03x or 0.97x) to smoothly realign audio without audible pops.
    - *Macro-drift (> 350ms)*: Direct seek to target authoritative timestamp.
  - **Automatic Reconnection & Mid-Song Recovery**: Instant state recovery when joining or recovering from network drop.

- **Unified Multi-Source Media Queue**:
  - **YouTube Integration**:
    - Supports standard YouTube links, YouTube Shorts, YouTube Music, and YouTube playlists.
    - Uses the official **YouTube IFrame Player API** (no unauthorized extraction or proxying).
    - **Video Mode** (watch synchronized video together in compact or theater view) and **Audio Mode** (album artwork and waveform visualizer).
    - Embed restriction detection: gracefully alerts admin and offers a 1-click skip if video owner disables embedding.
  - **Spotify Integration**:
    - Supports Spotify tracks, albums, and playlist URLs.
    - Metadata resolution via official Spotify oEmbed API (artwork, title, artist).
    - Web Playback SDK connection modal for Spotify Premium users.
    - Direct "Open in Spotify" deep-link and synchronized progress visualization.
  - **Direct Audio & User Uploads**:
    - Direct MP3/WAV/OGG/FLAC/AAC URLs.
    - Local file upload engine with Multer (up to 30MB).
    - Preloaded royalty-free demo tracks (Lo-fi Chill, Synthwave, Cyber Electro).

- **Room & Session Resilience**:
  - 25-second disconnect grace period prevents accidental username forfeiture during browser refreshes or WiFi blips.
  - Automatic admin promotion if the active host leaves permanently.
  - Automatic room closure and 6-digit code release when the last participant departs.

---

## 🛠️ Tech Stack

- **Frontend**:
  - React 19 + TypeScript + Vite
  - Tailwind CSS v4 + Custom Glassmorphism Theme
  - Lucide React Icons
  - Socket.IO Client
  - Canvas Waveform Visualizer
- **Backend**:
  - Node.js + Express
  - Socket.IO (WebSockets with polling fallback)
  - Multer (audio upload storage)
  - TypeScript + tsx
- **APIs**:
  - YouTube IFrame API
  - Spotify Web Playback SDK & oEmbed
  - HTML5 Audio & Web Audio API

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or newer recommended, v25 supported)
- npm or yarn

### 1. Installation
Clone the repository and install root, server, and client dependencies:

```bash
git clone https://github.com/xHertxd/xHertxdd.git
cd WaveLink

# Install root dependencies
npm install

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
cd ..
```

### 2. Environment Variables
Copy `.env.example` in `server/`:

```bash
cp server/.env.example server/.env
```

Default variables:
```env
PORT=5000
NODE_ENV=development

# Optional: Spotify Developer API Credentials (oEmbed works without keys)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

### 3. Running in Development Mode
Run both backend server and Vite frontend concurrently from the root directory:

```bash
npm run dev
```

- **Frontend Application**: `http://localhost:3000`
- **Backend API & WebSockets**: `http://localhost:5000`

---

## 🚢 Production Build & Deployment

### Build
```bash
# Build frontend
npm run build

# Build backend
cd server && npm run build
```

### Run Production Server
```bash
cd server
npm run start
```

### Deployment Options:
- **Render / Railway**: Deploy the `server/` directory as a Node.js web service. Set the build command to `npm install && npm run build` and start command to `npm run start`.
- **Vercel / Netlify**: Deploy the `client/` directory with root set to `client`, build command `npm run build`, and output directory `dist`. Update Vite proxy or `SERVER_URL` in `client/src/services/socket.ts` to point to your deployed backend domain.

---

## 📄 License
MIT License. Built for modern synchronized listening experiences.
