import { Bell, Clock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotificationsOptional } from '@/components/notifications/notifications-context'

export function HomePanel() {
  const notifications = useNotificationsOptional()
  const items = notifications?.notifications ?? []

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-12 bg-foreground shrink-0">
        <span className="text-sm font-medium text-background">Home</span>
      </div>

      {/* Clock widget placeholder */}
      <div className="px-4 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span className="text-xs font-mono">{new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Notifications — fed by the messaging 'canvas' channel (hooks/rules
          notify(), agents) over websocket; recent items survive page loads
          via the server-side buffer. */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Notifications
            </span>
          </div>
          {items.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-xs text-muted-foreground"
              onClick={() => void notifications?.clear()}
              title="Clear notifications"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-10 border border-dashed rounded-lg">
            No notifications
          </div>
        ) : (
          <div className="space-y-2">
            {[...items].reverse().map((item) => (
              <div key={item.id} className="rounded-lg border p-2.5">
                <p className="text-xs whitespace-pre-wrap break-words">{item.text}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(item.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
