import { isOffline, reportNetworkFailure, reportNetworkSuccess, onConnectivityChange } from './connectivity'

// Probes never gate document requests: the service worker can continue serving
// cached metadata/content even while the server is unreachable.
export function createConnectionMonitor(url: string, recovered: () => void) {
  let pending: Promise<boolean> | null = null
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined

  function schedule() {
    clearTimeout(timer)
    if (!stopped && isOffline()) timer = setTimeout(() => { void retry() }, 30000)
  }

  function retry(forceReconnect = false): Promise<boolean> {
    if (pending) return pending
    if (stopped) return Promise.resolve(false)
    clearTimeout(timer)
    controller = new AbortController()
    const timeout = setTimeout(() => controller?.abort(), 5000)
    pending = (async () => {
      try {
        const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller!.signal })
        if (!response.ok || response.headers.get('x-canvas-offline') === 'fallback') throw new Error('Unavailable')
        const body = await response.json()
        if (body.status !== 'success') throw new Error('Not a Canvas response')
        if (stopped) return false
        const wasOffline = isOffline()
        reportNetworkSuccess()
        if (wasOffline || forceReconnect) recovered()
        return true
      } catch {
        if (!stopped) reportNetworkFailure()
        return false
      } finally {
        clearTimeout(timeout)
        pending = null
        schedule()
      }
    })()
    return pending
  }

  const unsubscribe = onConnectivityChange(schedule)
  const online = () => { void retry() }
  window.addEventListener('online', online)
  schedule()
  return {
    retry,
    stop() {
      stopped = true
      clearTimeout(timer)
      controller?.abort()
      unsubscribe()
      window.removeEventListener('online', online)
    },
  }
}
