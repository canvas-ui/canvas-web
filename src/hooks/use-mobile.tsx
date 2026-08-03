import { useSyncExternalStore } from 'react'

/**
 * Viewport breakpoint hooks.
 *
 * MOBILE_BREAKPOINT must stay in step with `--breakpoint-md` in
 * src/theme/css/layout.css. It is duplicated here rather than read from CSS
 * because the value has to be available during render, before first paint, and
 * `getComputedStyle` in a subscription would be a layout read in a hot path.
 */
export const MOBILE_BREAKPOINT = 768

const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Subscribe/snapshot pair for a media query, cached per query string.
 *
 * `useSyncExternalStore` re-subscribes whenever the subscribe function's
 * identity changes, so these must be stable across renders — hence a module
 * cache rather than closures built inside the hook.
 */
const stores = new Map<
  string,
  { subscribe: (onStoreChange: () => void) => () => void; getSnapshot: () => boolean }
>()

function storeFor(query: string) {
  let store = stores.get(query)
  if (!store) {
    const supported = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    store = {
      subscribe: (onStoreChange: () => void) => {
        if (!supported()) return () => {}
        const mql = window.matchMedia(query)
        mql.addEventListener('change', onStoreChange)
        return () => mql.removeEventListener('change', onStoreChange)
      },
      getSnapshot: () => (supported() ? window.matchMedia(query).matches : false),
    }
    stores.set(query, store)
  }
  return store
}

/**
 * True when the viewport is narrower than the `md` breakpoint.
 *
 * This previously held `useState<boolean | undefined>(undefined)` and filled it
 * in from an effect, so it returned `false` on the first render *on every
 * device*. Mobile users got one frame of the desktop layout, and any component
 * branching on it mounted the desktop tree first and then swapped — a visible
 * jump on a slow phone, and the reason menu-context.tsx had to call
 * `matchMedia` by hand instead of trusting this hook.
 *
 * `useSyncExternalStore` reads the query *during* render, so the first paint is
 * already correct.
 *
 * It also now uses `matchMedia` for the snapshot rather than
 * `window.innerWidth`. The two disagree by the scrollbar width on desktop, so
 * the old code could report a different answer than the `md:` CSS applied to
 * the very same element.
 *
 * Note this tracks viewport *width*, not input type. For "does this need
 * finger-sized targets", use the density tokens (`--touch-target-min`), which
 * key off `pointer: coarse` — a wide tablet is not mobile but is still touch.
 */
export function useIsMobile(): boolean {
  const store = storeFor(MOBILE_QUERY)
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false)
}

/** Same contract as useIsMobile, for an arbitrary media query. */
export function useMediaQuery(query: string): boolean {
  const store = storeFor(query)
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false)
}
