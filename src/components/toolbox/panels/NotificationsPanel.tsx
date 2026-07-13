import { Bell } from 'lucide-react'

// Placeholder Notifications panel. The tab is in the toolbox top bar now so the
// surface exists; it becomes a live feed (and a more prominent, badged entry)
// once notification delivery is wired in.
export function NotificationsPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">No notifications yet</p>
          <p className="text-xs text-muted-foreground">
            This is where activity, agent updates, and alerts will appear once
            notifications are wired in.
          </p>
        </div>
      </div>
    </div>
  )
}
