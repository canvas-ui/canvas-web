import { useEffect, useRef } from 'react'
import { Socket } from 'socket.io-client'

export interface EventHandlers {
  // `never[]` params keep every concrete handler signature assignable
  // (contravariance) without resorting to `any`.
  [event: string]: (...args: never[]) => void
}

/** Listener shape socket.io accepts; handlers are widened to it when bound. */
type SocketListener = (...args: unknown[]) => void

/**
 * Generic hook to subscribe to a Canvas WebSocket topic and wire event handlers.
 *
 * It automatically handles:
 *   • fastify-side `subscribe` / `unsubscribe` messages
 *   • attaching & detaching event listeners
 *
 * Usage example:
  *   useSocketSubscription(socket, 'agent', {
 *     'agent:created': (data) => { ... },
 *     'agent:deleted': (data) => { ... },
 *   })
 */
export function useSocketSubscription(
  socket: Socket | null,
  topic: string,
  handlers: EventHandlers
) {
  // Keep the latest handlers readable from the subscription below without
  // making them a dependency — callers pass inline objects, and resubscribing
  // on every render would thrash the socket channel.
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    if (!socket) return

    // Subscribe to the channel once connected
    socket.emit('subscribe', { channel: topic })

    // Register stable listeners that dispatch to the latest handlers. The set
    // of event names is captured when the subscription is (re)created.
    const listeners: Array<[string, SocketListener]> = Object.keys(handlersRef.current).map((event) => {
      const listener: SocketListener = (...args) => {
        (handlersRef.current[event] as SocketListener | undefined)?.(...args)
      }
      socket.on(event, listener)
      return [event, listener]
    })

    // Cleanup on unmount or socket change
    return () => {
      socket.emit('unsubscribe', { channel: topic })
      for (const [event, listener] of listeners) {
        socket.off(event, listener)
      }
    }
  }, [socket, topic])
}
