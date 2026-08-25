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

/** Matches `--breakpoint-lg` in src/theme/css/layout.css. See useIsTooNarrowToDock. */
export const DOCK_BREAKPOINT = 1024

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

/**
 * True when the viewport is too narrow to dock a side panel BESIDE the content.
 *
 * `useIsMobile` answers "is this a phone-shaped viewport", which is the right
 * question for a full-screen drawer but the wrong one for the docked toolbox /
 * add panel. Those are ~420px flex siblings sitting next to a 48px rail and,
 * when it is open, a 280px menu panel. A landscape phone (a P30 is 780x360)
 * clears the `md` breakpoint by 12px, so the shell laid all of that out side by
 * side and the content column collapsed to nothing — the page text squeezed
 * into a sliver on the left, or vanished entirely.
 *
 * Docking is only worth it when the content keeps a readable column of its own,
 * so these panels go full-drawer below `lg` rather than below `md`.
 */
export function useIsTooNarrowToDock(): boolean {
  return useMediaQuery(`(max-width: ${DOCK_BREAKPOINT - 1}px)`)
}

/** Same contract as useIsMobile, for an arbitrary media query. */
export function useMediaQuery(query: string): boolean {
  const store = storeFor(query)
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false)
}
