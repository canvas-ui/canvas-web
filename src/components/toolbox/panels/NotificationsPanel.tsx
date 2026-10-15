import { useState } from 'react'
import { Bell, CheckCircle2, CircleAlert, Clock, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotificationsOptional } from '@/components/notifications/use-notifications'

export function NotificationsPanel() {
  const history = useNotificationsOptional()
  const [visibleCount, setVisibleCount] = useState(50)
  const items = history?.notifications ?? []
  const visible = items.slice(-visibleCount).reverse()

  return (
    <section aria-label="Notification history" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Notifications{items.length > 0 && <span className="ml-2 font-normal text-muted-foreground">{items.length}</span>}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Saved on this browser</p>
        </div>
        {items.length > 0 && <Button variant="ghost" size="sm" onClick={() => void history?.clear()} title="Clear all notifications" className="shrink-0 gap-1.5">
          <Trash2 className="h-3.5 w-3.5" />Clear all
        </Button>}
      </div>
      {history?.storageError && <p role="alert" className="border-b px-4 py-3 text-xs text-destructive">Couldn’t access notification history in this browser.</p>}
      {history?.loading ? <p role="status" className="p-4 text-sm text-muted-foreground">Loading notifications…</p> : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Bell className="h-5 w-5 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <ol className="space-y-2">
            {visible.map(item => {
              const Icon = item.status === 'error' ? CircleAlert : item.status === 'completed' ? CheckCircle2 : item.status === 'started' ? Clock : Bell
              return <li key={item.id} data-notification-id={item.id} className="rounded-(--card-radius) border bg-card p-3">
                <div className="flex items-start gap-2">
                  <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{item.title}</p>
                    {item.text && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{item.text}</p>}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      <time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString()}</time>
                      {item.status === 'started' && <span> · Started</span>}
                      {item.status === 'completed' && <span> · Completed</span>}
                      {item.status === 'error' && <span> · Error</span>}
                    </p>
                  </div>
                  <button type="button" onClick={() => void history?.remove(item.id)} aria-label={`Clear notification: ${item.title}`} title="Clear notification" className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent focus-ring touch-target"><X className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            })}
          </ol>
          {items.length > visibleCount && <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setVisibleCount(count => count + 50)}>Show older notifications</Button>}
        </div>
      )}
    </section>
  )
}
