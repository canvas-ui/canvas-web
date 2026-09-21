import { API_URL } from '@/config/api'
import socketService from './socket'
import { createConnectionMonitor } from './connection-monitor'

let monitor: ReturnType<typeof createConnectionMonitor> | undefined

export function startServerConnectionMonitor() {
  monitor = createConnectionMonitor(`${API_URL}/ping`, () => socketService.retryNow())
  // A failed websocket alone need not mean HTTP is unavailable. Verify it
  // before showing offline state; successful probes also resume the socket.
  const check = () => { void monitor?.retry() }
  const offError = socketService.on('connect_error', check)
  const offDisconnect = socketService.on('disconnect', check)
  return () => {
    offError()
    offDisconnect()
    monitor?.stop()
    monitor = undefined
  }
}

export function retryServerConnection() {
  return monitor?.retry(true) ?? Promise.resolve(false)
}
