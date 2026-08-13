import { createContext, useContext } from 'react'
import type { AppNotification } from '@/services/notifications'

export interface NotificationsContextType {
  notifications: AppNotification[]
  clear: () => Promise<void>
}

export const NotificationsContext = createContext<NotificationsContextType | null>(null)

// Null-safe: pub/share pages render without the provider.
export function useNotificationsOptional(): NotificationsContextType | null {
  return useContext(NotificationsContext)
}
