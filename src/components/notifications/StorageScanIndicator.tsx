import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { listBackends, type Backend } from '@/services/workspace'
import socketService from '@/lib/socket'

/** Persistent, unobtrusive scan progress, including scans started before login. */
export function StorageScanIndicator({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const [scans, setScans] = useState<Backend[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const scanKey = (backend: Backend) => `${workspaceId}:${backend.address}:${backend.resyncStartedAt || ''}`

  useEffect(() => {
    let disposed = false
    let pending = false
    let refreshAgain = false
    const refresh = async () => {
      if (pending) { refreshAgain = true; return }
      pending = true
      try {
        const backends = await listBackends(workspaceId)
        if (!disposed) setScans(backends.filter(backend => backend.resyncing))
      } catch { /* Keep the last known progress during transient disconnects. */ }
      finally {
        pending = false
        if (refreshAgain && !disposed) { refreshAgain = false; void refresh() }
      }
    }
    const onChange = (event: { workspaceId?: string }) => {
      if (event.workspaceId === workspaceId) void refresh()
    }
    void refresh()
    // Poll also covers reconnects, missed startup events and quiet progress updates.
    const timer = setInterval(() => { void refresh() }, 3000)
    socketService.on('backend.resync.changed', onChange)
    return () => {
      disposed = true
      clearInterval(timer)
      socketService.off('backend.resync.changed', onChange)
    }
  }, [workspaceId])

  const visible = scans.filter(backend => !dismissed.has(scanKey(backend)))
  if (!visible.length) return null
  return (
    <aside aria-label={`Storage scans for ${workspaceName}`} className="absolute bottom-5 right-5 z-50 w-72 max-w-[calc(100vw-2.5rem)] rounded-lg border bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur">
      <div role="status" className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        <span className="min-w-0 flex-1">
          <span className="block">Scanning storage</span>
          <span className="block truncate text-xs font-normal text-muted-foreground" title={workspaceName}>{workspaceName}</span>
        </span>
        <button type="button" aria-label={`Hide scan progress for ${workspaceName}`} title="Hide progress; scanning continues" className="rounded p-1 hover:bg-muted focus-visible:outline focus-visible:outline-2" onClick={() => setDismissed(previous => new Set([...previous, ...visible.map(scanKey)]))}>
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-48 space-y-3 overflow-y-auto">
        {visible.map(backend => {
          const { scanned = 0, total = null } = backend.progress || {}
          const percent = total && total > 0 ? Math.min(100, Math.round(scanned / total * 100)) : null
          const name = typeof backend.config?.label === 'string' ? backend.config.label : backend.address
          return (
            <div key={backend.address}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate">{name}</span>
                <span className="shrink-0 text-muted-foreground">{total === null ? `${scanned} files` : `${scanned} / ${total}`}</span>
              </div>
              <div role="progressbar" aria-label={`Scanning ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full bg-primary ${percent === null ? 'animate-pulse' : 'transition-all'}`} style={{ width: percent === null ? '35%' : `${percent}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
