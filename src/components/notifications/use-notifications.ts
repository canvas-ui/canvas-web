import { createContext, useContext } from 'react'
import type { LocalNotification } from '@/lib/notification-history'

export interface NotificationsContextType {
  notifications: LocalNotification[]
  loading: boolean
  storageError: boolean
  clear: () => Promise<void>
  remove: (id: string) => Promise<void>
}

export const NotificationsContext = createContext<NotificationsContextType | null>(null)

// Null-safe: pub/share pages render without the provider.
export function useNotificationsOptional(): NotificationsContextType | null {
  return useContext(NotificationsContext)
}
