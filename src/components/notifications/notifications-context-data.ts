import { createContext, useContext } from 'react'
import type { AppNotification } from '@/services/notifications'

export interface NotificationsContextType {
  notifications: AppNotification[]
  clear: () => Promise<void>
}
export const NotificationsContext = createContext<NotificationsContextType | null>(null)
export function useNotificationsOptional(): NotificationsContextType | null {
  return useContext(NotificationsContext)
}
