import { api } from '@/lib/api'

// In-app notifications (messaging 'canvas' adapter): recent items come from
// the REST buffer, live ones over the ws 'notification' event.

export interface AppNotification {
  id: string
  text: string
  timestamp: string
}

// Optional/background fetches: on auth failure they must reject quietly (the
// callers `.catch()` them) rather than bounce the user to /login.
export async function listNotifications(): Promise<AppNotification[]> {
  const res = await api.get<{ payload: AppNotification[] }>('/messaging/notifications', { noAuthRedirect: true })
  return res.payload || []
}

export async function clearNotifications(): Promise<void> {
  await api.delete('/messaging/notifications', { noAuthRedirect: true })
}
