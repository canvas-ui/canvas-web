import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { socketService } from '@/lib/socket'
import { useToast } from '@/components/ui/toast-container'
import { listNotifications, clearNotifications, type AppNotification } from '@/services/notifications'

// In-app notifications: seeds from the REST buffer, then appends live ws
// 'notification' events (messaging canvas adapter). Each live arrival also
// pops a toast; the full list feeds the toolbox Home panel.

interface NotificationsContextType {
  notifications: AppNotification[]
  clear: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextType | null>(null)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const { showToast } = useToast()

  useEffect(() => {
    let cancelled = false
    listNotifications()
      .then((items) => { if (!cancelled) setNotifications(items) })
      .catch(() => {})

    const off = socketService.on('notification', (payload: unknown) => {
      const item = payload as AppNotification
      if (!item?.id || !item?.text) return
      setNotifications((prev) => (prev.some((n) => n.id === item.id) ? prev : [...prev, item].slice(-50)))
      showToast({ title: 'Notification', description: item.text })
    })

    return () => { cancelled = true; off?.() }
  }, [showToast])

  const clear = useCallback(async () => {
    setNotifications([])
    await clearNotifications().catch(() => {})
  }, [])

  return (
    <NotificationsContext.Provider value={{ notifications, clear }}>
      {children}
    </NotificationsContext.Provider>
  )
}

// Null-safe: pub/share pages render without the provider.
export function useNotificationsOptional(): NotificationsContextType | null {
  return useContext(NotificationsContext)
}
