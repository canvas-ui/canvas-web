// Global UI wallpaper — an optional background image on the desk surface
// (the backdrop every sheet/panel rests on). Defaults to no image, i.e. the
// theme's plain desk color. Stored in localStorage so it works offline and
// needs no server round-trip; applied via CSS custom properties consumed by
// the `surface-desk` utility.
//
// Two kinds of wallpaper:
//   · built-in — shipped by @augmentd-labs/canvas-wallpapers and served from
//     /wallpapers; stored as the reference `builtin:<id>`, never as a URL, so
//     the paths and formats stay ours to change between releases.
//   · custom — the user's own image, stored inline as a data URL.

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
// localStorage quota is ~5 MB; leave room for everything else stored there.
export const WALLPAPER_MAX_BYTES = 3.5 * 1024 * 1024

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

export function loadWallpaper(): WallpaperSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WallpaperSettings>
      if (typeof parsed.image === 'string' || parsed.image === null) {
        const fit: WallpaperFit = parsed.fit === 'fill' || parsed.fit === 'center' ? parsed.fit : 'cover'
        return { image: parsed.image ?? null, fit }
      }
    }
  } catch { /* fall through to default */ }
  return { image: null, fit: 'cover' }
}

export function saveWallpaper(settings: WallpaperSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
  applyWallpaper(settings)
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

/** Push the settings into the CSS vars `surface-desk` consumes. */
export function applyWallpaper(settings: WallpaperSettings = loadWallpaper()): void {
  const style = document.documentElement.style
  const image = wallpaperImageCss(settings.image)
  if (!image) {
    style.removeProperty('--wallpaper-image')
    style.removeProperty('--wallpaper-size')
    return
  }
  style.setProperty('--wallpaper-image', image)
  style.setProperty('--wallpaper-size', wallpaperSizeCss(settings.fit))
}
