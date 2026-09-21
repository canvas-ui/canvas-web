import { io, Socket } from 'socket.io-client'
import { WS_URL } from '@/config/api'

// Get auth token from localStorage
function getAuthToken(): string | null {
  // Only get the real authentication token, not any default value
  const token = localStorage.getItem('authToken')
  if (!token || token === 'canvas-server-token') {
    return null;
  }
  return token;
}

/** The `{ status, payload }` envelope an RPC ack carries — see request(). */
interface SocketAck {
  status?: 'success' | 'error'
  code?: string
  message?: string
  payload?: unknown
}

/**
 * Any event handler a caller may register. `never[]` params make every concrete
 * handler signature assignable (contravariance) without resorting to `any`.
 */
export type SocketEventHandler = (...args: never[]) => void

/** Internal wrapper shape actually bound onto the socket.io instance. */
type SocketListener = (...args: unknown[]) => void

class SocketService {
  private socket: Socket | null = null
  private connected: boolean = false
  private authToken: string | null = null
  private handlers: Map<string, Set<SocketEventHandler>> = new Map()
  private socketWrappers: Map<string, Map<SocketEventHandler, SocketListener>> = new Map()
  private desiredSubscriptions: Set<string> = new Set()
  private baseUrl: string
  private connectionId: string = '';

  constructor() {
    this.baseUrl = WS_URL
    this.connectionId = `socket-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }

  connect(token?: string) {
    const authToken = token || getAuthToken()
    if (!authToken || authToken === 'canvas-server-token') return

    // One manager owns retries. Repeated subscriptions and auth checks must
    // not replace it and restart its backoff while the server is unavailable.
    if (this.socket && this.authToken === authToken) return
    this.cleanupSocket()
    this.authToken = authToken
    this.socket = io(this.baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 10000,
      forceNew: true,
      extraHeaders: {
        Authorization: `Bearer ${authToken}`,
        'X-Connection-ID': this.connectionId,
      },
      auth: { token: authToken },
    })
    this.setupDefaultHandlers()
    this.registerHandlers()
    this.socket.connect()
  }

  private cleanupSocket() {
    // Remove listeners first: intentional teardown must not start more work.
    this.socket?.removeAllListeners()
    this.socket?.disconnect()
    this.socket = null
    this.connected = false
    this.socketWrappers.clear()
  }

  private setupDefaultHandlers() {
    if (!this.socket) return
    this.socket.on('connect', () => {
      this.connected = true
      for (const channel of this.desiredSubscriptions) {
        this.socket?.emit('subscribe', { channel })
      }
    })
    this.socket.on('disconnect', () => {
      this.connected = false
    })
    this.socket.on('connect_error', () => {
      // Socket.IO retries transport failures with backoff. Auth rejection
      // intentionally waits for a fresh credential instead of retrying it.
      this.connected = false
    })
  }

  private registerHandlers() {
    if (!this.socket) return

    // Register all pending handlers
    this.handlers.forEach((callbacks, event) => {
      callbacks.forEach((callback) => {
        this.attach(event, callback)
      })
    })
  }

  private attach(event: string, callback: SocketEventHandler) {
    if (!this.socket) return
    let eventWrappers = this.socketWrappers.get(event)
    if (!eventWrappers) {
      eventWrappers = new Map()
      this.socketWrappers.set(event, eventWrappers)
    }
    if (eventWrappers.has(callback)) return

    const wrapper: SocketListener = (...args) => (callback as SocketListener)(...args)
    eventWrappers.set(callback, wrapper)
    this.socket.on(event, wrapper)
  }

  private detach(event: string, callback: SocketEventHandler) {
    if (!this.socket) return
    const eventWrappers = this.socketWrappers.get(event)
    const wrapper = eventWrappers?.get(callback)
    if (!wrapper) return
    this.socket.off(event, wrapper)
    eventWrappers?.delete(callback)
    if (eventWrappers && eventWrappers.size === 0) {
      this.socketWrappers.delete(event)
    }
  }

  // Add event handler
  on(event: string, callback: SocketEventHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    const set = this.handlers.get(event)!
    if (set.has(callback)) return () => this.off(event, callback)
    set.add(callback)

    if (this.socket) this.attach(event, callback)

    return () => this.off(event, callback)
  }

  // Remove event handler
  off(event: string, callback: SocketEventHandler) {
    const set = this.handlers.get(event)
    if (!set) return
    if (!set.has(callback)) return
    set.delete(callback)
    if (set.size === 0) this.handlers.delete(event)
    this.detach(event, callback)
  }

  /**
   * Request/response over the socket: emit with an ack callback and resolve the
   * server's `{ status, payload }` envelope, rejecting on `status: 'error'`.
   *
   * Every other channel here is push-only fan-out — this exists for query
   * sessions, which are connection-scoped mutable server state (a stateless
   * REST call cannot hold the resolved operand bitmaps). Never queues: an RPC
   * against a dead socket must fail fast so the caller can fall back to its
   * stateless path rather than silently hanging.
   */
  request<T = unknown>(event: string, payload?: unknown, timeoutMs = 10000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error('Socket not connected'))
        return
      }
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error(`Socket request timed out: ${event}`))
      }, timeoutMs)

      try {
        this.socket.emit(event, payload ?? {}, (response: SocketAck) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (response?.status === 'error') {
            reject(new Error(response.message || `${event} failed`))
          } else {
            resolve((response?.payload ?? response) as T)
          }
        })
      } catch (error) {
        settled = true
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  // Emit event to server
  emit(event: string, ...args: unknown[]) {
    // Track desired subscriptions so we can auto-resubscribe after reconnects.
    if (event === 'subscribe') {
      const payload = args?.[0] as { channel?: unknown } | undefined
      const channel = payload?.channel
      if (typeof channel === 'string' && channel) this.desiredSubscriptions.add(channel)
    } else if (event === 'unsubscribe') {
      const payload = args?.[0] as { channel?: unknown } | undefined
      const channel = payload?.channel
      if (typeof channel === 'string' && channel) this.desiredSubscriptions.delete(channel)
    }

    if (this.socket && this.connected) {
      try {
        this.socket.emit(event, ...args)
      } catch (error) {
        console.error(`Error emitting event ${event}:`, error)
        // Attempt reconnection if emission fails
        this.reconnect()
      }
    } else {
      this.connect()
    }
  }

  // Logout stops the manager's retries and forgets subscriptions.
  disconnect() {
    this.cleanupSocket()
    this.authToken = null
    this.desiredSubscriptions.clear()
  }

  isConnected() {
    return this.connected
  }

  // Explicit recovery may bypass a pending backoff. Ordinary callers use
  // reconnect(), which leaves the manager's schedule intact.
  retryNow() {
    if (this.connected) return
    this.cleanupSocket()
    this.connect()
  }

  // Ensure a connection exists without interrupting an ongoing retry.
  reconnect() {
    this.connect()
  }

}

export const socketService = new SocketService()
export default socketService
