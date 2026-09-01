// Coalesced connectivity state for the API layer. Offline, every uncached
// request fails the same way; reporting each one (a toast per call) swamps
// the user with a dozen identical "network error" messages per interaction.
// Instead the FIRST failure flips us to offline and the first success flips
// us back, and subscribers react to the transition, not to each request.
//
// Not derived from navigator.onLine alone: that only knows about the NIC,
// not whether the server is reachable — a server restart looks exactly like
// being offline from the app's point of view, and should be reported once.

type Listener = (offline: boolean) => void

let offline = false
const listeners = new Set<Listener>()

function set(next: boolean): void {
  if (offline === next) return
  offline = next
  for (const l of listeners) l(offline)
}

export function isOffline(): boolean {
  return offline
}

/** A request failed at the network layer (no HTTP response at all). */
export function reportNetworkFailure(): void {
  set(true)
}

/** A request got an HTTP response — the server is reachable. */
export function reportNetworkSuccess(): void {
  set(false)
}

export function onConnectivityChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// The NIC coming back is a strong hint; the next successful request confirms.
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => set(true))
}
