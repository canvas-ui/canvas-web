# canvas-web

Parked work with enough context to pick it up cold. Not a backlog of
everything; only what has been thought through.

---

## Server-side appearance + live video wallpapers (not MVP)

Decided 2026-10-07. Today a wallpaper is pure CSS (`applyWallpaper` in
`src/lib/wallpaper.ts` sets `--wallpaper-image` / `--wallpaper-size`, painted
by the `surface-desk` utility in AppShell, StripShell and the apps page) and
the choice is device-local: the `canvas:wallpaper` localStorage key holds
`builtin:<id>` or a data URL, uploads capped at ~3.5 MB because that is what
localStorage fits. With ~10 browser instances across 4+ devices that model is
wrong; one setup everywhere is the goal.

### Target

- **Appearance settings live on the user's profile on the server** (theme,
  wallpaper, fit, playback), not in localStorage. localStorage stays as the
  first-paint cache so the desk does not flash.
- **Shipped wallpapers stay bundled** (`canvas-common/packages/wallpapers`,
  manifest `sources[]` by MIME). Everything else is **uploaded to the user's
  profile**; clients cache it locally (SW runtime cache, cache-first).
- **Live MP4 wallpapers** (WebM too): a real `<video autoplay muted loop
  playsinline>` layer behind the desk — CSS backgrounds cannot play video —
  with `object-fit` from the existing `fit` setting. `src/next/next.css`
  `.next-wallpaper` already reserves this slot. Frost is the theme where it
  shines; its glass blur over a playing video costs GPU every frame, so
  measure on a laptop.
  - **Playback speed is a setting** (`video.playbackRate`, e.g. 0.25–2×).
  - **User-controlled pause / stop** (a toggle in appearance settings and a
    quick action; stopped = poster only).
  - Poster / manifest `background` colour before first paint; poster only
    under `prefers-reduced-motion` (needs a `matchMedia` listener — CSS
    cannot pause a video); pause on `visibilitychange`; optionally poster on
    `navigator.connection.saveData` / low battery.
- Manifest and `WallpaperSettings` gain `kind: 'image' | 'video'` and a
  `poster` for video entries; the settings preview tile renders a `<video>`
  as well. Package authoring scripts (`scripts/wallpaper.js`, `derive.sh`)
  need an ffmpeg branch (transcode, poster frame, thumb) if any video is ever
  bundled — mind the npm package size; prefer upload over bundling.

### Serving: a per-user `/pub` route

Media elements cannot send a Bearer header and the content-ticket cookie
flow (`requestContentTicket` in `src/services/workspace.ts`) is per document
and short-lived, so it does not suit something that loads before the app is
even authenticated. Proposal: a **per-user public asset route, public by
default**, e.g. `GET /pub/users/<userId>/<asset>` (or `/pub/<handle>/…`),
backed by a user-scoped asset store in runtime-core:

- Upload: `POST /users/me/assets` (authenticated, content-addressed, size
  cap per asset and per user), returns the public URL + sha256.
- Read: plain GET, no auth, cacheable (`Cache-Control: public, max-age`,
  `ETag` = sha256, Range supported for video).
- Wallpapers are not sensitive and the user chooses what goes there, so
  public-by-default is acceptable; keep a per-asset `visibility` flag anyway
  so the same route can later serve avatars or anything the user wants
  linkable, and so a private default can be flipped per asset.
- Clients cache by sha256; the SW gets a `/pub/` cache-first runtime route
  (today its fetch handler bypasses Range requests and the offline LRU cache
  skips video, which is why wallpapers must not go through those).

### Order of work

1. runtime-core: user asset store + `/pub` route + `/users/me/appearance`
   (read/write the settings blob).
2. web: appearance settings read from the profile, localStorage as cache;
   wallpaper upload goes to `/users/me/assets`.
3. web: `DeskWallpaper` component (image + video), playback speed, pause,
   motion/visibility gating; settings preview.
4. package: `kind`/`poster` in the manifest; ffmpeg authoring only if a
   bundled video is wanted.
