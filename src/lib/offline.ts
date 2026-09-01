// Offline cache core — shared between the app and the service worker (sw.ts),
// so nothing in here may touch window/document. Two Cache Storage caches plus
// an IndexedDB side-table:
//
//   offline-content-v1  document bytes + thumbnails (immutable: the content
//                       endpoint is keyed by doc+location and blobs are
//                       content-addressed, so entries never go stale — LRU is
//                       purely a size policy)
//   offline-api-v1      GET /rest/v2 JSON, network-first with offline fallback
//
// The Cache API carries no metadata, so `entries` in IDB tracks per-URL
// {size, lastAccess, pinned} for LRU eviction against the user-set budget.
// Everything is per-client and opt-in (Settings → Offline).
//
// Deliberately NOT handled: <video>/<audio> streaming. Media elements fetch
// with Range headers through the cookie-ticket flow; serving 206 slices out of
// Cache Storage means caching full bodies on a byte-range miss and slicing
// responses manually — disproportionate complexity for offline video on a
// PWA that will eventually get a native app for local media.

export const CONTENT_CACHE = 'offline-content-v1'
export const API_CACHE = 'offline-api-v1'

export interface OfflineSettings {
  enabled: boolean
  budgetBytes: number
}

export const GIB = 1024 * 1024 * 1024
export const DEFAULT_OFFLINE_SETTINGS: OfflineSettings = { enabled: false, budgetBytes: 4 * GIB }
// Keep API JSON from silently crowding out blobs: entry-capped, not byte-capped.
export const API_CACHE_MAX_ENTRIES = 1000

export type EntryKind = 'content' | 'api'

export interface CacheEntry {
  url: string
  kind: EntryKind
  size: number
  lastAccess: number
  pinned: boolean
}

export interface ContextPin {
  contextId: string
  label: string
  urls: string[]
  bytes: number
  pinnedAt: number
  /** Warming stopped early because the pin approached the byte budget. */
  truncated?: boolean
}

// ─── Minimal promisified IndexedDB ──────────────────────────────────────────

const DB_NAME = 'canvas-offline'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config')
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'url' })
      if (!db.objectStoreNames.contains('pins')) db.createObjectStore('pins', { keyPath: 'contextId' })
    }
    req.onsuccess = () => {
      // A version bump elsewhere (new tab with newer code) closes us; drop the
      // memo so the next call reopens.
      req.result.onversionchange = () => { req.result.close(); dbPromise = null }
      resolve(req.result)
    }
    req.onerror = () => { dbPromise = null; reject(req.error) }
  })
  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb()
  return reqResult(db.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>)
}

async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb()
  return reqResult(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>)
}

async function idbPut(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value as never, key)
  return txDone(tx)
}

async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  return txDone(tx)
}

async function idbClear(store: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).clear()
  return txDone(tx)
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function getOfflineSettings(): Promise<OfflineSettings> {
  try {
    const stored = await idbGet<OfflineSettings>('config', 'settings')
    return stored ? { ...DEFAULT_OFFLINE_SETTINGS, ...stored } : DEFAULT_OFFLINE_SETTINGS
  } catch {
    return DEFAULT_OFFLINE_SETTINGS
  }
}

export async function setOfflineSettings(settings: OfflineSettings): Promise<void> {
  await idbPut('config', settings, 'settings')
}

// ─── Entry bookkeeping (called from the SW) ─────────────────────────────────

export async function recordEntry(url: string, kind: EntryKind, size: number): Promise<void> {
  const prev = await idbGet<CacheEntry>('entries', url)
  await idbPut('entries', {
    url, kind, size,
    lastAccess: Date.now(),
    pinned: prev?.pinned ?? false,
  } satisfies CacheEntry)
}

// Serving a cached response should refresh its LRU position, but not at one
// IDB write per request — a photo grid hits dozens of URLs per second.
const TOUCH_INTERVAL_MS = 60_000
const recentTouches = new Map<string, number>()

export async function touchEntry(url: string): Promise<void> {
  const last = recentTouches.get(url)
  const now = Date.now()
  if (last && now - last < TOUCH_INTERVAL_MS) return
  recentTouches.set(url, now)
  if (recentTouches.size > 4096) recentTouches.clear()
  const entry = await idbGet<CacheEntry>('entries', url)
  if (entry) await idbPut('entries', { ...entry, lastAccess: now })
}

export async function setPinned(urls: string[], pinned: boolean): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('entries', 'readwrite')
  const store = tx.objectStore('entries')
  for (const url of urls) {
    const req = store.get(url) as IDBRequest<CacheEntry | undefined>
    req.onsuccess = () => {
      const entry = req.result
      if (entry) store.put({ ...entry, pinned })
      // A pin for bytes not yet cached: record a placeholder so the flag
      // survives until the warmer's fetch lands and recordEntry merges it.
      else if (pinned) store.put({ url, kind: 'content', size: 0, lastAccess: Date.now(), pinned } satisfies CacheEntry)
    }
  }
  return txDone(tx)
}

// ─── Eviction ───────────────────────────────────────────────────────────────

// Oldest-unpinned-first until the content bytes fit the budget; API entries
// are additionally capped by count. Best-effort: concurrent evictions can
// race, and the loser just deletes an already-deleted entry.
export async function evictToBudget(budgetBytes: number): Promise<void> {
  const entries = await idbGetAll<CacheEntry>('entries')

  const api = entries.filter((e) => e.kind === 'api').sort((a, b) => a.lastAccess - b.lastAccess)
  const apiOverflow = api.slice(0, Math.max(0, api.length - API_CACHE_MAX_ENTRIES))

  const content = entries.filter((e) => e.kind === 'content')
  let total = content.reduce((sum, e) => sum + e.size, 0)
  const evictable = content.filter((e) => !e.pinned).sort((a, b) => a.lastAccess - b.lastAccess)
  const contentOverflow: CacheEntry[] = []
  for (const entry of evictable) {
    if (total <= budgetBytes) break
    contentOverflow.push(entry)
    total -= entry.size
  }

  if (!apiOverflow.length && !contentOverflow.length) return

  const [apiCache, contentCache] = await Promise.all([caches.open(API_CACHE), caches.open(CONTENT_CACHE)])
  await Promise.all([
    ...apiOverflow.map(async (e) => { await apiCache.delete(e.url); await idbDelete('entries', e.url) }),
    ...contentOverflow.map(async (e) => { await contentCache.delete(e.url); await idbDelete('entries', e.url) }),
  ])
}

// ─── Usage / clearing (app side) ────────────────────────────────────────────

export interface OfflineUsage {
  contentBytes: number
  contentCount: number
  pinnedBytes: number
  apiCount: number
}

export async function getOfflineUsage(): Promise<OfflineUsage> {
  const entries = await idbGetAll<CacheEntry>('entries')
  const content = entries.filter((e) => e.kind === 'content')
  return {
    contentBytes: content.reduce((sum, e) => sum + e.size, 0),
    contentCount: content.length,
    pinnedBytes: content.filter((e) => e.pinned).reduce((sum, e) => sum + e.size, 0),
    apiCount: entries.length - content.length,
  }
}

export async function clearOfflineCaches(): Promise<void> {
  await Promise.all([caches.delete(CONTENT_CACHE), caches.delete(API_CACHE)])
  await idbClear('entries')
  await idbClear('pins')
}

// ─── Context pins ───────────────────────────────────────────────────────────

export async function listContextPins(): Promise<ContextPin[]> {
  return idbGetAll<ContextPin>('pins')
}

export async function saveContextPin(pin: ContextPin): Promise<void> {
  await idbPut('pins', pin)
}

export async function removeContextPin(contextId: string): Promise<void> {
  const pin = await idbGet<ContextPin>('pins', contextId)
  if (pin?.urls.length) await setPinned(pin.urls, false)
  await idbDelete('pins', contextId)
}
