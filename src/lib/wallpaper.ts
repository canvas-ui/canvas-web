// Global UI wallpaper — an optional background image on the desk surface
// (the backdrop every sheet/panel rests on). Defaults to no image, i.e. the
// theme's plain desk color. Stored in IndexedDB so it works offline and
// needs no server round-trip; applied via CSS custom properties consumed by
// the `surface-desk` utility.
//
// Two kinds of wallpaper:
//   · built-in — shipped by @augmentd-labs/canvas-wallpapers and served from
//     /wallpapers; stored as the reference `builtin:<id>`, never as a URL, so
//     the paths and formats stay ours to change between releases.
//   · custom — the user's own image, stored unchanged as a data URL. Keeping
//     the original bytes also preserves animated GIFs.

import { getWallpaper, wallpaperThumbUrl, wallpaperUrl, wallpapers } from '@augmentd-labs/canvas-wallpapers'
import type { Wallpaper } from '@augmentd-labs/canvas-wallpapers'

export type WallpaperFit = 'fill' | 'cover' | 'center'

export interface WallpaperSettings {
  /** `builtin:<id>`, a data URL, or null = no wallpaper (theme desk color). */
  image: string | null
  fit: WallpaperFit
}

export const WALLPAPER_FIT_OPTIONS: Array<{ id: WallpaperFit; label: string; description: string }> = [
  { id: 'cover', label: 'Scale and Crop', description: 'Fills the screen, cropping edges as needed' },
  { id: 'fill', label: 'Fill', description: 'Stretches to the exact screen size' },
  { id: 'center', label: 'Centered', description: 'Original size, centered on the desk' },
]

const KEY = 'canvas:wallpaper'
// File bytes, before base64 encoding. Large images belong in IndexedDB, not
// the small localStorage quota shared by auth, theme, and other preferences.
export const WALLPAPER_MAX_BYTES = 10 * 1024 * 1024
const DB_NAME = 'canvas-wallpaper'
const STORE = 'settings'

const BUILTIN_PREFIX = 'builtin:'

/** The wallpapers shipped in the box, for the picker. */
export const BUILTIN_WALLPAPERS: Wallpaper[] = wallpapers

/** Small preview image for a built-in, used by the picker. */
export function builtinThumbUrl(wallpaper: Wallpaper): string {
  return wallpaperThumbUrl(wallpaper) ?? ''
}

/** Stored reference for a built-in wallpaper. */
export function builtinRef(id: string): string {
  return `${BUILTIN_PREFIX}${id}`
}

/** The built-in's id if `image` refers to one, else null (custom or unset). */
export function builtinIdOf(image: string | null): string | null {
  return image?.startsWith(BUILTIN_PREFIX) ? image.slice(BUILTIN_PREFIX.length) : null
}

function normalizeSettings(value: unknown): WallpaperSettings | null {
  if (!value || typeof value !== 'object') return null
  const parsed = value as Partial<WallpaperSettings>
  if (typeof parsed.image !== 'string' && parsed.image !== null) return null
  return { image: parsed.image, fit: parsed.fit === 'fill' || parsed.fit === 'center' ? parsed.fit : 'cover' }
}

function loadLegacyWallpaper(): WallpaperSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const settings = normalizeSettings(JSON.parse(raw))
      if (settings) return settings
    }
  } catch { /* fall through to default */ }
  return { image: null, fit: 'cover' }
}

let currentSettings = loadLegacyWallpaper()
let restorePromise: Promise<WallpaperSettings> | null = null

/** Synchronous snapshot for React's initial state and the legacy first paint. */
export function loadWallpaper(): WallpaperSettings {
  return currentSettings
}

async function storedWallpaper(settings?: WallpaperSettings): Promise<unknown> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    let blocked = false
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => { blocked = true; reject(new Error('Close other Canvas tabs and try again.')) }
  })
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, settings ? 'readwrite' : 'readonly')
      const store = transaction.objectStore(STORE)
      const request = settings ? store.put(settings, KEY) : store.get(KEY)
      // A successful put request isn't durable until its transaction commits.
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally { db.close() }
}

function clearLegacyWallpaper(): void {
  try { localStorage.removeItem(KEY) } catch { /* IndexedDB is already committed. */ }
}

/** Restore once, migrating older localStorage wallpapers only after a commit. */
export function restoreWallpaper(): Promise<WallpaperSettings> {
  if (!restorePromise) restorePromise = (async () => {
    try {
      const stored = normalizeSettings(await storedWallpaper())
      if (stored) currentSettings = stored
      else await storedWallpaper(currentSettings)
      clearLegacyWallpaper()
    } catch { /* Keep the legacy wallpaper if storage is unavailable. */ }
    applyWallpaper(currentSettings)
    return currentSettings
  })()
  return restorePromise.then(() => currentSettings)
}

export async function saveWallpaper(settings: WallpaperSettings): Promise<void> {
  await restoreWallpaper()
  await storedWallpaper(settings)
  currentSettings = settings
  clearLegacyWallpaper()
  applyWallpaper(settings)
}

/** Read without resizing or re-encoding, which would flatten an animated GIF. */
export function readWallpaperFile(file: File): Promise<string> {
  if (file.size > WALLPAPER_MAX_BYTES) return Promise.reject(new Error('Image too large. Choose one up to 10 MB.'))
  const type = file.type || (/\.gif$/i.test(file.name) ? 'image/gif' : '')
  if (!type.startsWith('image/')) return Promise.reject(new Error('Pick an image file (animated GIFs are supported).'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the image. Try selecting it again.'))
    reader.onabort = () => reject(new Error('Reading the image was cancelled.'))
    reader.readAsDataURL(file.type ? file : file.slice(0, file.size, type))
  })
}

// `image-set()` lets the browser pick the first format it can decode, so the
// AVIF rendition reaches browsers that support it and the last source (always
// a universally supported format) covers the rest. Where image-set itself is
// missing we skip straight to that last source.
const SUPPORTS_IMAGE_SET =
  typeof CSS !== 'undefined' &&
  CSS.supports('background-image', 'image-set(url("a.avif") type("image/avif"))')

/**
 * The CSS `background-image` value for a stored wallpaper reference, or null
 * when there is nothing to show — including a `builtin:` id we no longer ship,
 * which falls back to the theme's plain desk color rather than a broken URL.
 */
export function wallpaperImageCss(image: string | null): string | null {
  if (!image) return null

  const builtinId = builtinIdOf(image)
  if (builtinId === null) return `url("${image}")`

  const entry = getWallpaper(builtinId)
  if (!entry) return null

  const fallback = `url("${wallpaperUrl(entry, { types: [entry.sources[entry.sources.length - 1].type] })}")`
  if (!SUPPORTS_IMAGE_SET || entry.sources.length === 1) return fallback
  return `image-set(${entry.sources
    .map((source) => `url("${wallpaperUrl(entry, { types: [source.type] })}") type("${source.type}")`)
    .join(', ')})`
}

/** The CSS `background-size` value for a fit mode. */
export function wallpaperSizeCss(fit: WallpaperFit): string {
  return fit === 'fill' ? '100% 100%' : fit === 'center' ? 'auto' : 'cover'
}

let appliedUpload: { dataUrl: string; objectUrl: string } | null = null

function wallpaperBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('Invalid wallpaper data URL')
  const header = dataUrl.slice(5, comma)
  const content = dataUrl.slice(comma + 1)
  let bytes: Uint8Array<ArrayBuffer>
  if (header.endsWith(';base64')) {
    const decoded = atob(content)
    bytes = new Uint8Array(decoded.length)
    for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index)
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(content))
  }
  return new Blob([bytes], { type: header.split(';')[0] })
}

/** Push the settings into the CSS vars `surface-desk` consumes. */
export function applyWallpaper(settings: WallpaperSettings = loadWallpaper()): void {
  const style = document.documentElement.style
  const previousUpload = appliedUpload
  let source = settings.image
  if (source?.startsWith('data:')) {
    try {
      if (appliedUpload?.dataUrl !== source) {
        appliedUpload = { dataUrl: source, objectUrl: URL.createObjectURL(wallpaperBlob(source)) }
      }
      // CSS custom properties have a size limit (~2 MiB in Chromium). Only
      // the short URL goes into CSS; IndexedDB keeps the original image, and
      // the Blob preserves every GIF frame. Reuse it when only the fit changes.
      source = appliedUpload.objectUrl
    } catch {
      // A malformed legacy value must not stop the app from starting.
      appliedUpload = null
      source = null
    }
  } else {
    appliedUpload = null
  }
  const image = wallpaperImageCss(source)
  if (!image) {
    style.removeProperty('--wallpaper-image')
    style.removeProperty('--wallpaper-size')
  } else {
    style.setProperty('--wallpaper-image', image)
    style.setProperty('--wallpaper-size', wallpaperSizeCss(settings.fit))
  }
  // Replace the style before releasing the old image. Object URLs are runtime
  // resources: never persist them, and keep only the current upload alive.
  if (previousUpload && previousUpload !== appliedUpload) {
    URL.revokeObjectURL(previousUpload.objectUrl)
  }
}
