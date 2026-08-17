// Global UI wallpaper — an optional background image on the desk surface
// (the backdrop every sheet/panel rests on). Defaults to no image, i.e. the
// theme's plain desk color. Stored in localStorage as a data URL so it works
// offline and needs no server round-trip; applied via CSS custom properties
// consumed by the `surface-desk` utility.

export type WallpaperFit = 'fill' | 'cover' | 'center'

export interface WallpaperSettings {
  /** data: or http(s) URL; null = no wallpaper (theme desk color only). */
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

/** Push the settings into the CSS vars `surface-desk` consumes. */
export function applyWallpaper(settings: WallpaperSettings = loadWallpaper()): void {
  const style = document.documentElement.style
  if (!settings.image) {
    style.removeProperty('--wallpaper-image')
    style.removeProperty('--wallpaper-size')
    return
  }
  style.setProperty('--wallpaper-image', `url("${settings.image}")`)
  style.setProperty('--wallpaper-size', settings.fit === 'fill' ? '100% 100%' : settings.fit === 'center' ? 'auto' : 'cover')
}
