import { useSyncExternalStore } from 'react'

const KEY = 'canvas:alwaysOnReader'

function read(): boolean {
  try {
    const v = localStorage.getItem(KEY)
    return v !== 'off'
  } catch {
    return true
  }
}

// Cached snapshot: useSyncExternalStore calls getSnapshot on every render.
let current: boolean = read()
const listeners = new Set<() => void>()

function loadAlwaysOnReader(): boolean {
  return current
}

export function setAlwaysOnReader(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? 'on' : 'off')
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

export function useAlwaysOnReader(): boolean {
  return useSyncExternalStore(subscribe, loadAlwaysOnReader, () => true)
}
