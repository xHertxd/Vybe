# Vybe 🎵

> **One Beat. Every Device.**
> A real-time, multi-device listening room for YouTube, Spotify, direct audio and uploads.

Vybe puts every device in a room on the same beat. One person runs the room, everyone hears the
same track at the same moment, and a server-authoritative clock keeps drift under control —
including after refreshes, network drops and mid-song joins.

---

## Two pages, one room

**1. Room entry (`/`)**

- Create a room: a unique 6-digit code is generated and the creator becomes **admin**.
- Join a room by code. Joining a code that does not exist creates it instantly.
- Usernames are 2–20 letters, unique per room, case-insensitive.
- A dropped listener keeps their seat and name for 25 seconds; leaving frees it immediately.
- Deep links work: `/room/123456` prefills the join form.

**2. Music room (`/room/:code`)**

- **Admin:** play, pause, seek, previous/next, shuffle, repeat (off/all/one), add/remove/reorder/
  clear queue, connect Spotify, end room.
- **Listener:** synchronized playback, queue/people views, room code + invite link copy, local
  volume, leave room.
- Unified player stage for YouTube video/audio modes, Spotify artwork, direct audio and uploads.
- Live presence with latency and drift per listener, reconnect banner, and staged error handling
  (embed blocked, removed video, Spotify not connected, browser autoplay gate).

---

## How synchronization works

1. **Server-authoritative state.** The server owns playback status, position, queue, settings and
   a monotonic `version`. Clients never guess.
2. **NTP-style clock sync.** Clients exchange `sync:ping` / `sync:pong` with the server, discard
   high-RTT outliers and use a median offset to convert local time to server time.
3. **Scheduled starts.** Play/seek commands are scheduled ~600 ms in the future, so every client
   can buffer and begin together.
4. **Continuous correction.** A drift loop compares the local adapter position against the
   server-computed position:
   - under ~260 ms: no correction;
   - 260 ms–1.2 s: inaudible 1.03× / 0.97× rate nudges;
   - over 1.2 s: hard seek to the authoritative position.
5. **Heartbeats + recovery.** The server publishes authoritative snapshots on an interval, and
   clients request a resume with their `sessionToken` after any reconnect.

---

## Media support

| Source | Resolution | Playback |
| --- | --- | --- |
| YouTube video / Shorts / Music | URL parsing + oEmbed | Official YouTube IFrame API |
| YouTube playlists | YouTube Data API v3 (optional key) → public RSS fallback | IFrame API, one queue item per video |
| Spotify track / album / playlist | Spotify Web API (optional server credentials) → public oEmbed | Spotify Web Playback SDK, per-listener **Premium** OAuth |
| Direct audio links | Extension/content detection | HTML5 audio |
| File uploads | Multer, 30 MB cap | HTML5 audio |

**Spotify limitation, stated honestly:** Spotify does not allow third-party servers to stream its
catalogue. Vybe never extracts or proxies Spotify audio. Each listener connects their own Premium
account through PKCE; the room keeps everyone on the same position using the SDK. Free accounts
see a clear explanation and an **Open in Spotify** fallback.

Uploads use the server filesystem. On serverless hosts such as Vercel they land in `/tmp` and are
not durable — prefer links for permanent rooms.

---

## Tech stack

- **Client:** React 19, TypeScript, Vite, Tailwind CSS v4, Socket.IO client, Lucide icons,
  YouTube IFrame API, Spotify Web Playback SDK.
- **Server:** Node.js, Express, Socket.IO, TypeScript, Multer.
- **Transport:** WebSockets with polling fallback; server-side validation on every action.

---

## Local development

Requires Node.js 18+ (Node 20/22 recommended).

```bash
git clone https://github.com/xHertxd/xHertxdd.git
cd WaveLink
npm install
npm --prefix server install
npm --prefix client install
```

Create environment files:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Run both processes:

```bash
npm run dev
```

- Client: <http://localhost:3000>
- API + WebSockets: <http://localhost:5000>
- Health check: <http://localhost:5000/api/health>

Vite proxies `/api`, `/uploads` and `/socket.io` to the backend in development. `VITE_SERVER_URL`
is also set explicitly in `client/.env.example`; either path works.

### Optional integrations

- **YouTube playlists:** set `YOUTUBE_API_KEY` on the server for Data API metadata. Without it,
  Vybe falls back to the public playlist feed and warns when the list cannot be read.
- **Spotify:**
  1. Create an app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard).
  2. Add `http://localhost:3000/` (and your production origin `/`) as Redirect URIs.
  3. Set `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` on the server and
     `VITE_SPOTIFY_CLIENT_ID` on the client.
  4. Each listener must have Spotify **Premium** to play Spotify tracks in the browser.

---

## Production

```bash
npm run build          # client -> client/dist
npm run build:server   # server -> server/dist
npm start              # single Node process serves API + client/dist
```

When the server finds `client/dist`, it serves the built SPA and rewrites unknown paths to
`index.html`, so `/room/:code` works from one process.

### Vercel (frontend) + Node host (backend) — recommended

1. Deploy `server/` to Render, Railway, Fly.io or any Node host that supports long-lived
   WebSockets. Build: `npm install && npm run build`; start: `npm start`. Set the server env vars
   from `server/.env.example` and `ALLOWED_ORIGINS` to your Vercel URL.
2. Deploy the repository root to Vercel. `vercel.json` builds the client and rewrites SPA routes.
3. In Vercel, set `VITE_SERVER_URL=https://your-backend.example.com` (no trailing slash) and
   `VITE_SPOTIFY_CLIENT_ID`.
4. Add the Vercel origin to Spotify Redirect URIs and to `ALLOWED_ORIGINS`.

### Vercel-only / serverless caveats

Vercel can run the Node server and supports native WebSockets, but each serverless instance has
its own memory. Rooms, sessions and queues live in memory today, so a multi-instance deployment
can route two listeners to different instances and break a room. Use a single instance for demos,
or add a shared state/adapter layer (Redis + Socket.IO Redis adapter) before scaling out.
Uploads on serverless are ephemeral (`/tmp`).

---

## Security & validation

- Every socket action is validated server-side; admin-only actions return `FORBIDDEN`.
- Sessions use a per-participant `sessionToken`, preventing user-id spoofing on reconnect.
- Username and room-code formats are enforced on both client and server.
- Upload MIME/extension and size limits are enforced with Multer.
- `ALLOWED_ORIGINS` restricts browser origins in production.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Server + client with live reload |
| `npm run server` | Server only (`tsx watch`) |
| `npm run client` | Client only (Vite) |
| `npm run build` | Production client build |
| `npm run build:server` | Type-check/compile server |
| `npm start` | Start the server process |

---

MIT License. Built for listening together.
