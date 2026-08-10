import { registerSW } from 'virtual:pwa-register'

// Service-worker update flow, prompt-style:
//  - hourly registration.update() DISCOVERS new deployments even in long-lived
//    installed-PWA windows (which otherwise only check on open);
//  - a found update never force-reloads — subscribers (UpdateBanner) surface a
//    "Reload" affordance and applyUpdate() activates + reloads on the user's
//    click. The SW itself waits (no unconditional skipWaiting — see sw.ts), so
//    the running page keeps its matching precache until the user opts in.
type Listener = () => void
const listeners = new Set<Listener>()
let updateReady = false

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => { void registration.update() }, 60 * 60 * 1000)
  },
  onNeedRefresh() {
    updateReady = true
    listeners.forEach((l) => l())
  },
})

/** Subscribe to "an update is ready"; fires immediately if one already is. */
export function onUpdateReady(listener: Listener): () => void {
  listeners.add(listener)
  if (updateReady) listener()
  return () => { listeners.delete(listener) }
}

/** Activate the waiting service worker and reload. */
export function applyUpdate(): void {
  void updateSW(true)
}
