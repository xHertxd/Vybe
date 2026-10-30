# Vybe — Perfection TODO

## 🔴 Critical (Must Fix)

- [x] **Remove `CURATED_TRACKS`** — Delete hardcoded 30 tracks from `client/src/services/musicLibrary.ts`; populate modal with `fetchTrendingTracks(20)` on mount
- [x] **Add rate limiting** — `express-rate-limit` on `/api/search`, `/api/library/*` (30 req/min/IP)
- [x] **Fix `queue:play_now`** — Already implemented in server `app.ts`
- [x] **YouTube search reliability** — Require `YOUTUBE_API_KEY` for search; fallback to link-only mode; added circuit breaker
- [x] **Room auto-join race condition** — Reset `autoJoinTriggered.current` when username changes in `RoomEntryPage.tsx`

## 🟡 High Priority

- [x] **Cache invalidation** — Added `invalidateFreeToUseCache()` in `freeToUse.ts`; call after `queue:add`/`queue:play_now`
- [x] **Retry/backoff** — Wrap FreeToUse fetches with 2× retry + 500ms backoff in `freeToUseService.ts`
- [x] **Type safety** — Use shared `ResolveMediaResponse` type consistently in server resolve & client `resolveDirectMedia`
- [x] **Error Boundary** — Added focus trap and aria attributes to Modal; added aria-labels to icon buttons
- [x] **Upload limit mismatch** — Aligned client with server config via `/api/config` endpoint

## 🟢 Medium Priority

- [x] **Centralize config** — Created `/api/config` endpoint exposing upload limits, timeouts, cache TTLs; consume on client
- [x] **Accessibility** — Added `aria-label` on icon buttons, `aria-describedby` on search, focus trap in Modal
- [x] **FreeToUse base URL** — Moved to `config.ts` with `FREETOUSE_API_URL` env var
- [x] **Remove dead code** — Verified `virtualRoomEngine.ts` is used for serverless P2P fallback; `keepAlive.ts` is used
- [ ] **Logo component** — Verify `Logo.tsx` exists; fix import or create

## 🔵 Polish

- [ ] **Contrast audit** — Ensure gold `#fde5b7` on dark backgrounds passes WCAG AA
- [ ] **Font hierarchy** — Decide on single display font (Archivo Black vs Bebas Neue)
- [ ] **Remove YouTube HTML scraping** — Use official Data API or `youtube-search-api` package
- [ ] **Single search source** — Client only calls `/api/search`; remove local `CURATED_TRACKS.filter()` fallback
- [ ] **Environment examples** — Update `.env.example` with `FREETOUSE_API_URL`, `YOUTUBE_API_KEY` required notes

## ✅ Done (This Session)

- [x] FreeToUse service + endpoints (`/api/search`, `/api/library/*`)
- [x] AddMediaModal with 3 tabs (Library, Link, Upload)
- [x] RoomEntryPage with digit inputs, username edit, auto-join
- [x] Dark/gold theme in `index.css` with CSS custom properties
- [x] Footer component
- [x] Server preset removal (no demo data)
- [x] Socket same-origin + connection retry
- [x] Git commit + push to `origin/Vybe`
- [x] Live integration tests passing (25/25)
- [x] Removed CURATED_TRACKS, use server trending endpoint
- [x] Rate limiting on public endpoints
- [x] Cache invalidation after queue mutations
- [x] Retry/backoff on FreeToUse fetches
- [x] YouTube Data API integration with circuit breaker
- [x] Type-safe resolve-media endpoint
- [x] Dynamic upload limit from server config
- [x] Accessibility improvements (focus trap, aria labels)
- [x] InlineSearch updated to use server trending
- [x] YouTube Data API integration with circuit breaker