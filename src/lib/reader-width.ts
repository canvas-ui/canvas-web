import { useSyncExternalStore } from 'react'

const KEY = 'canvas:readerWidth'
const MIN = 320
const MAX = 1600
function readWidth(): number | null {
  try {
    const value = Number(sessionStorage.getItem(KEY))
    return Number.isFinite(value) && value >= MIN && value <= MAX ? value : null
  } catch { return null }
}
let width = readWidth()
const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function setWidth(value: number | null) {
  width = value === null ? null : Math.round(Math.max(MIN, Math.min(MAX, value)))
  try {
    if (width === null) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, String(width))
  } catch { /* Storage can be unavailable; keep the in-memory preference. */ }
  listeners.forEach(listener => listener())
}
export function useReaderWidth() {
  return useSyncExternalStore(subscribe, () => width, () => null)
}

