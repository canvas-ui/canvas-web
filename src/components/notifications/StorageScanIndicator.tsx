import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { listBackends, type Backend } from '@/services/workspace'
import socketService from '@/lib/socket'

type Scan = Pick<Backend, 'address' | 'config' | 'progress' | 'resyncStartedAt'>
interface ScanChange {
  workspaceId?: string
  backend?: string
  resyncing?: boolean
  progress?: Backend['progress']
}

/** Persistent, unobtrusive scan progress, including scans started before login. */
export function StorageScanIndicator({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const [scans, setScans] = useState<Scan[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const scanKey = (backend: Scan) => `${workspaceId}:${backend.address}:${backend.resyncStartedAt || ''}`

  useEffect(() => {
    let disposed = false
    let pending = false
    let refreshAgain = false
    let version = 0
    const changes = new Map<string, { version: number; event: ScanChange }>()
    let knownBackends = new Map<string, Backend>()
    const applyChange = (current: Scan[], event: ScanChange): Scan[] => {
      const remaining = current.filter(backend => backend.address !== event.backend)
      if (!event.resyncing) return remaining
      const existing = current.find(backend => backend.address === event.backend)
      const backend = existing || knownBackends.get(event.backend!)
      return [...remaining, {
        address: event.backend!, config: backend?.config,
        resyncStartedAt: backend?.resyncStartedAt || new Date().toISOString(),
        progress: event.progress ?? backend?.progress,
      }]
    }
    const refresh = async () => {
      if (pending) { refreshAgain = true; return }
      pending = true
      const requestVersion = version
      try {
        const backends = await listBackends(workspaceId)
        if (!disposed) {
          knownBackends = new Map(backends.map(backend => [backend.address, backend]))
          let next: Scan[] = backends.filter(backend => backend.resyncing)
          // An older snapshot must not undo progress/completion received while
          // it was downloading.
          for (const change of changes.values()) {
            if (change.version > requestVersion) next = applyChange(next, change.event)
          }
          setScans(next)
        }
      } catch { /* Keep the last known progress during transient disconnects. */ }
      finally {
        pending = false
        if (refreshAgain && !disposed) { refreshAgain = false; void refresh() }
      }
    }
    const onChange = (event: ScanChange) => {
      if (event.workspaceId !== workspaceId || !event.backend || typeof event.resyncing !== 'boolean') return
      changes.set(event.backend, { version: ++version, event })
      setScans(previous => applyChange(previous, event))
    }
    const onBackendChanged = (event: { workspaceId?: string }) => {
      if (event.workspaceId === workspaceId) void refresh()
    }
    void refresh()
    const offConnect = socketService.on('connect', refresh)
    socketService.on('backend.resync.changed', onChange)
    socketService.on('backend.changed', onBackendChanged)
    window.addEventListener('focus', refresh)
    return () => {
      disposed = true
      offConnect?.()
      socketService.off('backend.resync.changed', onChange)
      socketService.off('backend.changed', onBackendChanged)
      window.removeEventListener('focus', refresh)
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
