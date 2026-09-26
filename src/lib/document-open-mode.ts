import { useSyncExternalStore } from 'react'

export type DocumentOpenMode = 'modal' | 'side'

const KEY = 'canvas:documentOpenMode'

function read(): DocumentOpenMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'side' ? 'side' : 'modal'
  } catch {
    return 'modal'
  }
}

// Cached snapshot: useSyncExternalStore calls getSnapshot on every render.
let current: DocumentOpenMode = read()
const listeners = new Set<() => void>()

export function loadDocumentOpenMode(): DocumentOpenMode {
  return current
}

export function setDocumentOpenMode(mode: DocumentOpenMode): void {
  try {
    if (mode === 'modal') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, mode)
  } catch {
    /* private mode / quota: keep the in-memory value for this session */
  }
  current = mode
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

export function useDocumentOpenMode(): DocumentOpenMode {
  return useSyncExternalStore(subscribe, loadDocumentOpenMode, () => 'modal')
}
