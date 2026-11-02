# Vybe 2.0 🎵⚡

> **High-Precision Multi-Device Synchronized Music Player**
> Turn every phone, laptop, and speaker into a single unified sound system with sub-millisecond hardware-accurate synchronization.

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](#)
[![React](https://img.shields.io/badge/React-18-61dafb)](#)
[![Vite](https://img.shields.io/badge/Vite-6-646cff)](#)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-white)](#)

---

## ✨ Features

- **Hardware-Sample Accurate Synchronization**: Uses the browser's native `AudioContext` and hardware clock (`currentTime`) to schedule buffer start times down to the exact audio sample. Zero device start jitter.
- **Continuous Phase-Locked Loop (PLL)**: Monitors drift in real-time and performs inaudible micro-rate corrections ($\pm 0.2\%$) to keep drift strictly bounded under $5\text{ms}$.
- **Autonomous New-Joiner Sync**: When a friend joins mid-song, their device seamlessly locks onto the continuous stream timestamp and starts playing in sync immediately without requiring the host to click play or re-sync.
- **Zero Database / Pure In-Memory Relay**: Lightning-fast Node.js and Socket.IO relay server. Zero persistent state on disk or database—rooms and state are maintained in memory while active.
- **Dedicated Spacebar Controller**: Spacebar exclusively toggles Play/Pause across the room (safeguarded so text typing in inputs is preserved).
- **FreeToUse Direct MP3 Catalog**: Search millions of copyright-free tracks across Lo-Fi, Synthwave, Chillhop, Electronic, and Acoustic with zero ads or interruptions.
- **Direct Audio URLs & Local File Upload**: Paste any direct audio link or upload an audio file to play in sync across all devices.
- **Live Waveform Visualizer**: Real-time FFT audio visualizer connected to Web Audio `AnalyserNode`.

---

## 🛠️ Architecture

```
WaveLink/
├── shared/             # Shared TypeScript types (@vybe/shared)
├── server/             # Zero-database in-memory Socket.IO relay & NTP sync
└── client/             # Vite + React 18 + Web Audio API hardware engine
```

### 1. Clock Synchronization (NTP)
Clients exchange high-speed ping/pong packets with the relay server. Jitter filtering discards high-RTT outliers and calculates the true monotonic server time:
$$\text{offset} = \text{serverTime} + \frac{\text{RTT}}{2} - \text{clientTime}$$

### 2. Scheduled Buffer Start
When the host commands playback:
$$\text{targetAudioContextTime} = \text{audioContext.currentTime} + \frac{\text{scheduledStartTime} - \text{serverNow}}{1000}$$
```ts
audioBufferSourceNode.start(targetAudioContextTime, initialOffsetSeconds);
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js `>= 20.0.0`
- npm

### Installation
```bash
# Clone the repository
git clone https://github.com/xHertxd/Vybe.git
cd Vybe

# Install all workspace dependencies
npm install

# Start both backend relay and frontend concurrently
npm run dev
```

The app will be available at:
- Frontend: `http://localhost:5173`
- Backend Relay: `http://localhost:10000`

---

## 📦 Building & Deployment

### Build Everything
```bash
npm run build
```

### Build Client Only (Vercel)
```bash
npm run build:client
```

### Build Server Only (Render)
```bash
npm run build:server
```

---

## 📄 License
MIT License © 2026 Vybe.

