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

class SocketService {
  private socket: Socket | null = null
  private connected: boolean = false
  private pending: boolean = false
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private handlers: Map<string, Set<Function>> = new Map()
  private socketWrappers: Map<string, Map<Function, Function>> = new Map()
  private baseUrl: string
  private connectionId: string = '';

  constructor() {
    // Use the WS_URL directly from config
    this.baseUrl = WS_URL
    console.log('Socket service initialized with base URL:', this.baseUrl)
    // Generate a unique ID for this socket service instance
    this.connectionId = `socket-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  connect(token?: string) {
    if (this.connected || this.pending) {
      console.log('Socket already connected or connection pending, skipping connect request');
      return;
    }
    this.pending = true;

    // Use auth token from localStorage if not provided
    const authToken = token || getAuthToken()
    console.log('🔍 DEBUG: Auth token check:', {
      tokenProvided: !!token,
      tokenFromStorage: !!getAuthToken(),
      tokenLength: authToken ? authToken.length : 0,
      tokenPreview: authToken ? authToken.substring(0, 20) + '...' : 'null'
    });

    if (!authToken) {
      console.error('❌ No auth token available for socket connection');
      console.log('🔍 DEBUG: localStorage contents:', Object.keys(localStorage));
      this.pending = false;
      return;
    }

    // Reject any suspicious tokens like hardcoded test values
    if (authToken === 'canvas-server-token') {
      console.error('Invalid token format detected: canvas-server-token');
      this.pending = false;
      return;
    }

    try {
      console.log('🔌 Attempting to connect to WebSocket server at:', this.baseUrl)
      console.log('🔑 Using auth token for socket connection:', authToken.substring(0, 10) + '...')

      // Destroy any existing socket connection
      this.cleanupSocket();

      // Create socket.io connection
      this.socket = io(this.baseUrl, {
        transports: ['websocket'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        forceNew: true,  // Force a new connection to avoid issues with previous connections
        timeout: 10000,  // Connection timeout in ms
        // Include the token in proper Authorization header format
        extraHeaders: {
          Authorization: `Bearer ${authToken}`,
          'X-Connection-ID': this.connectionId
        },
        auth: {
          token: authToken // Send the raw token without modification
        }
      })

      console.log('🎯 Socket.IO client initialized, connecting...')

      // Register basic event handlers
      this.setupDefaultHandlers()
    } catch (error) {
      console.error('💥 Socket connection setup error:', error)
      this.pending = false

      // Clean up any partial socket
      this.cleanupSocket();
    }
  }

  private cleanupSocket() {
    if (this.socket) {
      try {
        this.socket.disconnect();
        this.socket.removeAllListeners();
      } catch (e) {
        console.error('Error while cleaning up socket:', e);
      }
      this.socket = null;
    }

    // Clear wrapper tracking (we keep handlers so they can be rebound on reconnect)
    this.socketWrappers.clear();
  }

  private setupDefaultHandlers() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('✅ Socket connected with ID:', this.socket?.id)
      console.log('🔗 Connection established to:', this.baseUrl)
      this.connected = true
      this.pending = false
      this.reconnectAttempts = 0

      // Register any pending handlers
      this.registerHandlers()
    })

    this.socket.on('disconnect', (reason: string) => {
      console.log('🔌 Socket disconnected:', reason)
      console.log('🔍 DEBUG: Disconnect details:', {
        reason,
        wasConnected: this.connected,
        reconnectAttempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });
      this.connected = false
      this.pending = false

      // Auto-reconnect on most disconnect reasons (except explicit client disconnect)
      if (reason !== 'io client disconnect' && this.reconnectAttempts < this.maxReconnectAttempts) {
        console.log(`🔄 Attempting reconnection (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`)
        this.reconnectAttempts++
        // Wait a bit before trying to reconnect
        setTimeout(() => {
          if (!this.connected && !this.pending) {
            this.connect()
          }
        }, 2000)
      }
    })

    this.socket.on('connect_error', (error: any) => {
      console.error('💥 Socket connection error:', error.message)
      console.error('🔍 DEBUG: Connection error details:', {
        message: error.message,
        description: error.description,
        context: error.context,
        type: error.type,
        transport: error.transport,
        code: error.code
      });
      console.error('🔍 DEBUG: Full error object:', error)
      this.connected = false
      this.pending = false
    })

    this.socket.on('error', (error: any) => {
      console.error('Socket error:', error)
    })

    // Add handler for authenticated event
    this.socket.on('authenticated', (data: any) => {
      console.log('Socket authenticated:', data)
    })

    // Add handler for connection change events
    this.socket.on('connection:change', (data: any) => {
      console.log('Connection status changed:', data)
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

  private attach(event: string, callback: Function) {
    if (!this.socket) return
    let eventWrappers = this.socketWrappers.get(event)
    if (!eventWrappers) {
      eventWrappers = new Map()
      this.socketWrappers.set(event, eventWrappers)
    }
    if (eventWrappers.has(callback)) return

    const wrapper = (...args: any[]) => callback(...args)
    eventWrappers.set(callback, wrapper)
    this.socket.on(event, wrapper as any)
  }

  private detach(event: string, callback: Function) {
    if (!this.socket) return
    const eventWrappers = this.socketWrappers.get(event)
    const wrapper = eventWrappers?.get(callback)
    if (!wrapper) return
    this.socket.off(event, wrapper as any)
    eventWrappers?.delete(callback)
    if (eventWrappers && eventWrappers.size === 0) {
      this.socketWrappers.delete(event)
    }
  }

  // Add event handler
  on(event: string, callback: Function) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    const set = this.handlers.get(event)!
    if (set.has(callback)) return () => this.off(event, callback)
    set.add(callback)

    if (this.socket && this.connected) this.attach(event, callback)

    return () => this.off(event, callback)
  }

  // Remove event handler
  off(event: string, callback: Function) {
    const set = this.handlers.get(event)
    if (!set) return
    if (!set.has(callback)) return
    set.delete(callback)
    if (set.size === 0) this.handlers.delete(event)
    this.detach(event, callback)
  }

  // Emit event to server
  emit(event: string, ...args: any[]) {
    if (this.socket && this.connected) {
      try {
        this.socket.emit(event, ...args)
      } catch (error) {
        console.error(`Error emitting event ${event}:`, error)
        // Attempt reconnection if emission fails
        this.reconnect()
      }
    } else {
      console.warn('Socket not connected, cannot emit:', event)
      // Attempt to reconnect if not already connecting
      if (!this.pending && !this.connected) {
        this.connect()
      }
    }
  }

  // Disconnect socket
  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.connected = false
      this.pending = false
      this.reconnectAttempts = 0
    }
  }

  isConnected() {
    return this.connected
  }

  // Manually trigger reconnection
  reconnect() {
    this.cleanupSocket()
    this.connected = false
    this.pending = false

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Reconnecting socket (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      setTimeout(() => {
        this.connect()
      }, 1000)
    } else {
      console.error(`Reached maximum reconnection attempts (${this.maxReconnectAttempts})`)
      // Reset attempts to allow manual reconnection later
      setTimeout(() => {
        this.reconnectAttempts = 0
      }, 30000)
    }
  }
}

export const socketService = new SocketService()
export default socketService
