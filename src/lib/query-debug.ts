import { useEffect, useState } from 'react'

/**
 * "Debug query" — a per-user view toggle that asks the server to attach the raw
 * (unfloored) image kNN cosine distances for a search to its response.
 *
 * Why it exists: the image relevance floor (Settings → Database → Search
 * tuning) has to be re-calibrated for every embedding model, and picking it
 * blind is guesswork. With this on you can see where true matches actually land
 * versus where noise starts, and set the floor just above the last real match.
 *
 * Deliberately client-side (localStorage, not workspace config): it changes what
 * YOU see, costs a little extra work per query, and must not leak into other
 * users' sessions or into a saved canvas.
 */

const KEY = 'canvas:query-debug'
const EVENT = 'canvas:query-debug-changed'

export function isQueryDebugEnabled(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setQueryDebugEnabled(enabled: boolean): void {
  try {
    if (enabled) { localStorage.setItem(KEY, '1') } else { localStorage.removeItem(KEY) }
  } catch { /* private mode — the toggle just won't persist */ }
  // Same-tab listeners: the `storage` event only fires in OTHER tabs, so the
  // settings page toggling this would not reach the document list without it.
  window.dispatchEvent(new CustomEvent(EVENT, { detail: enabled }))
}

/** Live-tracking hook — updates when toggled here or in another tab. */
export function useQueryDebug(): boolean {
  const [enabled, setEnabled] = useState(isQueryDebugEnabled)
  useEffect(() => {
    const sync = () => setEnabled(isQueryDebugEnabled())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return enabled
}

/** One document's raw cosine distance to the query (0 = identical, 2 = opposite). */
export interface QueryDistance {
  id: number
  distance: number
}

export interface QueryDebugData {
  /** The query these distances belong to — with a refine stack, the LAST query. */
  query: string
  distances: QueryDistance[]
}
