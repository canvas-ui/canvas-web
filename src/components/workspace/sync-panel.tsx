import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Laptop, RefreshCw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { socketService } from '@/lib/socket'
import {
  forgetMirror,
  listMirrors,
  listSyncConflicts,
  resolveSyncConflict,
  type ConflictResolution,
  type SyncConflict,
  type WorkspaceMirror,
} from '@/services/sync'

/**
 * Workspace › Settings › Sync.
 *
 * Two things a device mirror leaves behind on the hub: its status report (how
 * far behind the change log it is, what is queued) and the conflict inbox —
 * the device's version of a file the hub changed meanwhile. The hub's version
 * always keeps the filename; here the user decides what happens to the other
 * one, and every choice carries the original's tags, relations and placements
 * over to whatever survives (canvas-server docs/sync.md).
 */

const formatDate = (d?: string | number | null) => {
  if (d == null || d === '') return '—'
  const date = typeof d === 'number' ? new Date(d) : new Date(d)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const formatBytes = (n?: number | null) => {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const shortSha = (sha?: string | null) => (sha ? sha.slice(0, 12) : '—')

function MirrorRow({ mirror, now, busy, onForget }: { mirror: WorkspaceMirror; now: number; busy: boolean; onForget: () => void }) {
  const m = mirror.mirror
  // `now` is captured when the list was loaded (render must stay pure).
  const stale = mirror.lastSeen ? now - new Date(mirror.lastSeen).getTime() > 10 * 60 * 1000 : true
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Laptop className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{mirror.name || mirror.deviceId}</span>
              {m.client && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono uppercase">{m.client}</span>}
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${stale ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}>
                {m.state || (stale ? 'offline' : 'online')}
              </span>
            </div>
            {m.path && <p className="mt-0.5 text-[11px] font-mono text-muted-foreground truncate">{m.path}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
              <span title="Change-log entries the device has not applied yet">lag {mirror.lag ?? '—'}</span>
              <span title="Local changes waiting to be pushed">pending {m.pending ?? 0}</span>
              {(m.failed ?? 0) > 0 && <span className="text-destructive">failed {m.failed}</span>}
              {(m.conflicts ?? 0) > 0 && <span className="text-amber-600 dark:text-amber-400">conflicts {m.conflicts}</span>}
              {(m.skipped ?? 0) > 0 && <span>skipped {m.skipped}</span>}
              <span>last sync {formatDate(m.lastSync)}</span>
              <span>seen {formatDate(mirror.lastSeen)}</span>
              {m.prefixes && m.prefixes.length > 0 && <span className="font-mono">{m.prefixes.join(', ')}</span>}
            </div>
            {m.lastError && <p className="mt-1 text-[11px] text-destructive">{m.lastError}</p>}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onForget} disabled={busy} title="Forget this mirror record (the device is not revoked)">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function ConflictRow({ conflict, busy, onResolve }: { conflict: SyncConflict; busy: boolean; onResolve: (keep: ConflictResolution) => void }) {
  const gone = !conflict.hub
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium font-mono break-all">{conflict.key}</p>
          <p className="text-[11px] text-muted-foreground">
            from <span className="font-medium">{conflict.deviceName || conflict.device || 'unknown device'}</span> · {formatDate(conflict.ts)}
            {conflict.mode === 'rename' && conflict.conflictKey && (
              <> · already on disk as <span className="font-mono">{conflict.conflictKey}</span></>
            )}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
        <div className="rounded border border-dashed p-2">
          <div className="text-muted-foreground">Hub version (keeps the name)</div>
          {conflict.hub ? (
            <div className="font-mono">{shortSha(conflict.hub.sha256)} · {formatBytes(conflict.hub.size)} · {formatDate(conflict.hub.mtime)}</div>
          ) : (
            <div className="italic text-muted-foreground">no file at this key any more</div>
          )}
        </div>
        <div className="rounded border border-dashed p-2">
          <div className="text-muted-foreground">Incoming version (the device&rsquo;s)</div>
          <div className="font-mono">{shortSha(conflict.incoming.sha256)} · {formatBytes(conflict.incoming.size)} · {formatDate(conflict.incoming.mtime)}</div>
        </div>
      </div>
      {conflict.resolvable ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy || gone} onClick={() => onResolve('hub')} title="Discard the device's version">
            Keep hub
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onResolve('incoming')} title="The device's bytes replace the hub's; tags, relations and placements move over">
            Keep incoming
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onResolve('both')} title="Keep the hub file and add the device's version under a conflict name">
            Keep both
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Dropbox-style conflict copy: both files are on disk, delete the one you do not need.</p>
      )}
    </div>
  )
}

export function SyncPanel({ workspaceId, workspaceUuid }: { workspaceId: string; workspaceUuid?: string }) {
  const { showToast } = useToast()
  const [mirrors, setMirrors] = useState<WorkspaceMirror[]>([])
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!workspaceId) return
    if (!quiet) setIsLoading(true)
    try {
      const [m, c] = await Promise.all([listMirrors(workspaceId), listSyncConflicts(workspaceId)])
      setMirrors(m)
      setConflicts(c)
      setLoadedAt(Date.now())
    } catch (err) {
      if (!quiet) showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load sync state', variant: 'destructive' })
    } finally {
      if (!quiet) setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // Live: the hub nudges on every change-log advance and on conflict traffic.
  // Coalesce into one quiet reload per burst.
  useEffect(() => {
    if (!workspaceUuid) return
    const channel = `workspace:${workspaceUuid}`
    const subscribe = () => socketService.emit('subscribe', { channel })
    const offConnect = socketService.on('connect', subscribe)
    subscribe()
    const schedule = (raw: unknown) => {
      const data = raw as { workspaceId?: string } | null
      if (data?.workspaceId && data.workspaceId !== workspaceUuid) return
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(() => { reloadTimer.current = null; void load(true) }, 800)
    }
    const offs = ['backend.changed', 'sync.conflict.created', 'sync.conflict.resolved'].map(evt => socketService.on(evt, schedule))
    return () => {
      offConnect()
      offs.forEach(off => off())
      socketService.emit('unsubscribe', { channel })
      if (reloadTimer.current) { clearTimeout(reloadTimer.current); reloadTimer.current = null }
    }
  }, [workspaceUuid, load])

  const handleForget = async (deviceId: string) => {
    setBusy(`mirror:${deviceId}`)
    try {
      await forgetMirror(workspaceId, deviceId)
      setMirrors(prev => prev.filter(m => m.deviceId !== deviceId))
      showToast({ title: 'Forgotten', description: 'Mirror record removed. The device keeps running and will report again if it still syncs this workspace.' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to forget mirror', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const handleResolve = async (conflict: SyncConflict, keep: ConflictResolution) => {
    setBusy(`conflict:${conflict.docId}`)
    try {
      const result = await resolveSyncConflict(workspaceId, conflict.docId, keep)
      setConflicts(prev => prev.filter(c => c.docId !== conflict.docId))
      const what = keep === 'hub' ? 'kept the hub version' : keep === 'incoming' ? 'the device version now holds the name' : `kept both (${result.resultKey || 'conflict copy'})`
      showToast({ title: 'Resolved', description: `${conflict.key}: ${what}` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to resolve conflict', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Device mirrors</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Devices keeping this workspace&rsquo;s files in sync (canvas-fuse <span className="font-mono">--mirror</span>, canvas-edge). Lag counts change-log entries the device has not applied yet.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => load()} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading && mirrors.length === 0 && conflicts.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Loading…</div>
      ) : mirrors.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
          No device mirrors this workspace yet. Mount it with <span className="font-mono">canvas-fuse mount -w &lt;workspace&gt; ~/Workspaces --mirror</span> on a device and it shows up here.
        </div>
      ) : (
        <div className="space-y-2">
          {mirrors.map(m => (
            <MirrorRow key={m.deviceId} mirror={m} now={loadedAt} busy={busy === `mirror:${m.deviceId}`} onForget={() => handleForget(m.deviceId)} />
          ))}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold">Conflicts</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          A device and the hub both changed the same file. The hub&rsquo;s version keeps the filename; decide what happens to the device&rsquo;s. Tags, relations and placements follow whichever version survives.
        </p>
      </div>
      {conflicts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">Nothing to resolve.</div>
      ) : (
        <div className="space-y-2">
          {conflicts.map(c => (
            <ConflictRow key={c.docId} conflict={c} busy={busy === `conflict:${c.docId}`} onResolve={keep => handleResolve(c, keep)} />
          ))}
        </div>
      )}
    </div>
  )
}

export default SyncPanel
