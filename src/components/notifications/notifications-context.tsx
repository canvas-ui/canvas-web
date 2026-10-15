import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { socketService } from '@/lib/socket'
import { useToast } from '@/components/ui/use-toast'
import {
  clearLocalNotifications, listLocalNotifications, notificationAccount,
  removeLocalNotification, subscribeNotificationHistory, type LocalNotification,
} from '@/lib/notification-history'
import { NotificationsContext } from './use-notifications'

// Every toast archives locally at the ToastContainer entry point. Incoming
// messages use the same path; no REST buffer or server-side clear is involved.
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [account] = useState(notificationAccount)
  const [notifications, setNotifications] = useState<LocalNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [storageError, setStorageError] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    let active = true
    let version = 0
    const refresh = async () => {
      const request = ++version
      try {
        const items = await listLocalNotifications(account)
        if (active && request === version) { setNotifications(items); setLoading(false) }
      } catch {
        if (active) { setStorageError(true); setLoading(false) }
      }
    }
    const unsubscribe = subscribeNotificationHistory(account, error => {
      setStorageError(error)
      if (!error) void refresh()
    })
    void refresh()
    return () => { active = false; unsubscribe() }
  }, [account])

  useEffect(() => socketService.on('notification', (payload: unknown) => {
    const item = payload as { id?: unknown; text?: unknown; timestamp?: unknown } | null
    if (!item || !['string', 'number'].includes(typeof item.id) || typeof item.text !== 'string' || !item.text) return
    showToast({ title: 'Notification', description: item.text, historyId: `message:${item.id}`,
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : undefined })
  }), [showToast])

  const clear = useCallback(async () => {
    try { await clearLocalNotifications(account) } catch { /* Storage status is reported by the shared store. */ }
  }, [account])
  const remove = useCallback(async (id: string) => {
    try { await removeLocalNotification(account, id) } catch { /* Same status channel as clear. */ }
  }, [account])

  return (
    <NotificationsContext.Provider value={{ notifications, loading, storageError, clear, remove }}>
      {children}
    </NotificationsContext.Provider>
  )
}
