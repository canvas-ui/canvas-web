import { api } from '@/lib/api'

// In-app notifications (messaging 'canvas' adapter): recent items come from
// the REST buffer, live ones over the ws 'notification' event.

export interface AppNotification {
  id: string
  text: string
  timestamp: string
}

export async function listNotifications(): Promise<AppNotification[]> {
  const res = await api.get<{ payload: AppNotification[] }>('/messaging/notifications')
  return res.payload || []
}

export async function clearNotifications(): Promise<void> {
  await api.delete('/messaging/notifications')
}
