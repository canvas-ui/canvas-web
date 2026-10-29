import { useSyncExternalStore } from 'react'

type TileStyle = 'square' | 'flickr' | 'masonry' | 'original'
export const TILE_STYLES: { id: TileStyle; label: string }[] = [
  { id: 'square', label: 'Square (Lychee-like)' },
  { id: 'flickr', label: 'Justified (Flickr-like)' },
  { id: 'masonry', label: 'Masonry (500px-like)' },
  { id: 'original', label: 'Original proportions' },
]
const KEY = 'canvas:tileStyle'

function read(): TileStyle {
  try {
    const v = localStorage.getItem(KEY)
    return TILE_STYLES.some(style => style.id === v) ? v as TileStyle : 'masonry'
  } catch {
    return 'masonry'
  }
}

// Cached snapshot: useSyncExternalStore calls getSnapshot on every render.
let current: TileStyle = read()
const listeners = new Set<() => void>()

function loadTileStyle(): TileStyle {
  return current
}

export function setTileStyle(enabled: TileStyle): void {
  try {
    localStorage.setItem(KEY, enabled)
  } catch {
    /* private mode / quota: keep the in-memory value for this session */
  }
  current = enabled
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== null) return
    current = read()
    fn()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

export function useTileStyle(): TileStyle {
  return useSyncExternalStore(subscribe, loadTileStyle, () => 'masonry')
}
