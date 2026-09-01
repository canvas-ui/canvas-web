/// <reference lib="webworker" />
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import {
  CONTENT_CACHE,
  API_CACHE,
  getOfflineSettings,
  recordEntry,
  touchEntry,
  evictToBudget,
  type OfflineSettings,
} from '@/lib/offline'

declare let self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// No unconditional skipWaiting: the new SW WAITS until the user accepts the
// update (UpdateBanner → applyUpdate → SKIP_WAITING message), so a running
// page never has its precache swapped out from under its lazy chunks.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([self.clients.claim(), pruneShareInbox()]))
})

const SHARE_CACHE = 'share-target-inbox'
// Cache Storage is not free real estate: a stash that throws QuotaExceededError
// rejects respondWith, which the OS renders as a bare "webpage not available"
// error page. Refuse oversized shares up front instead, with a message.
const MAX_SHARE_FILE_BYTES = 100 * 1024 * 1024
// Orphaned shares (any redirect that never reached ShareTargetPage — offline,
// backgrounded, user swiped away) are never drained by the page, and
// cleanupOutdatedCaches only touches workbox precaches. Left alone they pile up
// until the origin's quota is gone, which is what MAKES the stash above throw.
const SHARE_INBOX_TTL_MS = 24 * 60 * 60 * 1000

// Web Share Target (POST, multipart/form-data — see vite.config.ts's manifest
// share_target). The OS launches this as a plain browser POST navigation with
// no Authorization header, so the server can't authenticate it. Instead we
// intercept it here, stash the payload in Cache Storage, and redirect into the
// already-authenticated SPA — ShareTargetPage reads it back and uploads
// through the normal client-side flow (uploadWorkspaceBlob), same as a
// manual FAB upload.
// ─── Offline cache (opt-in, Settings → Offline) ─────────────────────────────
// Strategies (see src/lib/offline.ts for the storage/LRU model):
//   content/thumbnail GETs  cache-first — the endpoint is immutable per URL
//   other /rest/v2 GETs     network-first, cached copy only when unreachable
// Video/audio streaming (Range + cookie-ticket) is deliberately passed
// through uncached — see the header comment in lib/offline.ts.

// Document bytes and server thumbnails. `download=1` is a user-initiated save
// (don't burn cache on it); a Range header means a media element is streaming.
const CONTENT_RE = /^\/rest\/v2\/workspaces\/[^/]+\/documents\/[^/]+\/(content|thumbnail)$/
// Never serve stale auth, admin or realtime endpoints from cache.
const API_EXCLUDE_RE = /^\/rest\/v2\/(auth|admin|ping|events)\b/

// One settings read per request would hammer IDB; the toggle changing a few
// seconds late is fine.
let settingsMemo: { at: number; value: OfflineSettings } | null = null
async function offlineSettings(): Promise<OfflineSettings> {
  if (settingsMemo && Date.now() - settingsMemo.at < 10_000) return settingsMemo.value
  const value = await getOfflineSettings().catch(() => ({ enabled: false, budgetBytes: 0 }))
  settingsMemo = { at: Date.now(), value }
  return value
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'OFFLINE_SETTINGS_CHANGED') settingsMemo = null
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(request))
    return
  }
  if (request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith('/rest/v2/')) {
    if (
      CONTENT_RE.test(url.pathname) &&
      !url.searchParams.has('download') &&
      !request.headers.has('range')
    ) {
      event.respondWith(handleContent(event, request))
      return
    }
    if (!API_EXCLUDE_RE.test(url.pathname) && !CONTENT_RE.test(url.pathname)) {
      event.respondWith(handleApi(event, request))
      return
    }
  }
  // Navigation fallback. Without this every GET navigation — including the 303
  // target below — needs the network even though index.html is precached, so a
  // share on a marginal connection dies on an error page with the payload
  // already stashed and no way back to it. API and DAV paths are excluded:
  // they are not SPA routes and must always hit the server.
  if (request.mode === 'navigate' && !isServerPath(url.pathname)) {
    event.respondWith(handleNavigation(request))
  }
})

function isServerPath(pathname: string): boolean {
  return pathname.startsWith('/rest/') || pathname.startsWith('/dav/') || pathname.startsWith('/.well-known/')
}

// Cache-first for immutable document bytes. Misses are cached and the LRU
// budget enforced in the background (waitUntil keeps the SW alive for it).
async function handleContent(event: FetchEvent, request: Request): Promise<Response> {
  const settings = await offlineSettings()
  if (!settings.enabled) return fetch(request)

  const cache = await caches.open(CONTENT_CACHE)
  const hit = await cache.match(request.url, { ignoreVary: true })
  if (hit) {
    event.waitUntil(touchEntry(request.url).catch(() => {}))
    return hit
  }

  const res = await fetch(request)
  if (res.ok && res.status === 200) {
    const clone = res.clone()
    event.waitUntil((async () => {
      try {
        await cache.put(request.url, clone)
        // Content-Length is absent on chunked responses; read the cached copy
        // for the true size so the LRU ledger stays honest.
        const size = Number(res.headers.get('content-length')) ||
          (await (await cache.match(request.url))?.blob())?.size || 0
        await recordEntry(request.url, 'content', size)
        await evictToBudget(settings.budgetBytes)
      } catch (err) {
        // QuotaExceededError etc. — the response already went to the page.
        console.warn('[sw] offline content cache put failed', err)
      }
    })())
  }
  return res
}

// Network-first for API JSON: the live answer always wins; the cached copy
// exists only for when the server is unreachable.
async function handleApi(event: FetchEvent, request: Request): Promise<Response> {
  const settings = await offlineSettings()
  if (!settings.enabled) return fetch(request)

  try {
    const res = await fetch(request)
    if (res.ok && res.status === 200) {
      const clone = res.clone()
      event.waitUntil((async () => {
        try {
          const cache = await caches.open(API_CACHE)
          await cache.put(request.url, clone)
          await recordEntry(request.url, 'api', Number(res.headers.get('content-length')) || 0)
        } catch (err) {
          console.warn('[sw] offline api cache put failed', err)
        }
      })())
    }
    return res
  } catch (err) {
    const cache = await caches.open(API_CACHE)
    const hit = await cache.match(request.url, { ignoreVary: true })
    if (hit) {
      event.waitUntil(touchEntry(request.url).catch(() => {}))
      return hit
    }
    throw err
  }
}

async function handleNavigation(request: Request): Promise<Response> {
  try {
    return await fetch(request)
  } catch {
    // Offline: serve the SPA shell so the client router can pick up the URL
    // (crucially ?token=…, so a stashed share is still recoverable).
    const cached = await matchPrecache('/index.html')
    if (cached) return cached
    throw new Error('offline and index.html is not precached')
  }
}

// Never rejects: a rejected respondWith on a share navigation surfaces as
// ERR_FAILED with no way to tell the user what went wrong. Every failure path
// redirects into the SPA with an ?error= code that ShareTargetPage renders.
async function handleShareTarget(request: Request): Promise<Response> {
  try {
    const formData = await request.formData()
    const token = crypto.randomUUID()

    const title = String(formData.get('title') ?? '')
    const text = String(formData.get('text') ?? '')
    const url = String(formData.get('url') ?? '')
    const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)

    const oversized = files.find((f) => f.size > MAX_SHARE_FILE_BYTES)
    if (oversized) return shareError('too-large')

    const cache = await caches.open(SHARE_CACHE)
    await cache.put(
      `/share-target-inbox/${token}/meta`,
      new Response(JSON.stringify({ title, text, url, fileNames: files.map((f) => f.name), stashedAt: Date.now() })),
    )
    await Promise.all(
      files.map((file, i) =>
        cache.put(
          `/share-target-inbox/${token}/file-${i}`,
          new Response(file, { headers: { 'Content-Type': file.type, 'X-File-Name': file.name } }),
        ),
      ),
    )

    return Response.redirect(`/share-target?token=${token}`, 303)
  } catch (err) {
    console.error('[sw] share-target stash failed', err)
    return shareError('stash-failed')
  }
}

function shareError(code: string): Response {
  return Response.redirect(`/share-target?error=${code}`, 303)
}

// Drop stale inbox entries on activate. Entries predating the stashedAt stamp
// have no timestamp — treat those as stale too, since they can only be
// leftovers from a previous SW version.
async function pruneShareInbox(): Promise<void> {
  try {
    if (!(await caches.has(SHARE_CACHE))) return
    const cache = await caches.open(SHARE_CACHE)
    const keys = await cache.keys()
    const expired = new Set<string>()

    for (const req of keys) {
      const { pathname } = new URL(req.url)
      if (!pathname.endsWith('/meta')) continue
      const token = pathname.split('/')[2]
      if (!token) continue
      let stashedAt = 0
      try {
        const res = await cache.match(req)
        stashedAt = res ? Number((await res.json()).stashedAt ?? 0) : 0
      } catch { /* unreadable meta — treat as expired */ }
      if (!stashedAt || Date.now() - stashedAt > SHARE_INBOX_TTL_MS) expired.add(token)
    }

    await Promise.all(
      keys
        .filter((req) => expired.has(new URL(req.url).pathname.split('/')[2]))
        .map((req) => cache.delete(req)),
    )
  } catch (err) {
    console.error('[sw] share inbox prune failed', err)
  }
}
