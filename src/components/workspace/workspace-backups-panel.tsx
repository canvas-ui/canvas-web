import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Check, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { formatBytes } from '@/services/workspace'
import { BACKUPS_EVENT, createWorkspaceBackup, followWorkspaceBackup, getWorkspaceBackups, restoreWorkspaceBackup, type BackupStatus, type WorkspaceBackup } from '@/services/workspace-backups'

const labels = { startup: 'Startup', hourly: 'Hourly', manual: 'Manual', 'pre-restore': 'Before restore' }

export function WorkspaceBackupsPanel({ workspaceId, onRestored }: { workspaceId: string; onRestored: () => void }) {
  const { showToast, showProgress } = useToast()
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<WorkspaceBackup | null>(null)
  const [starting, setStarting] = useState(false)
  const mounted = useRef(false)
  const pending = useRef(false)
  const requestId = useRef(0)
  const refresh = useCallback(() => {
    const id = ++requestId.current
    return getWorkspaceBackups(workspaceId).then(next => {
      if (!mounted.current || id !== requestId.current) return
      setStatus(next); setError(null)
      for (const job of next.jobs.filter(item => item.status === 'running')) {
        void followWorkspaceBackup(showProgress, workspaceId, job).catch(() => {})
      }
    }).catch(cause => {
      if (mounted.current && id === requestId.current) setError(cause instanceof Error ? cause.message : String(cause))
    })
  }, [workspaceId, showProgress])
  useEffect(() => {
    mounted.current = true
    void refresh()
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ workspace: string; status: BackupStatus }>).detail
      if (detail.workspace === workspaceId) setStatus(detail.status)
    }
    window.addEventListener(BACKUPS_EVENT, update)
    return () => { mounted.current = false; window.removeEventListener(BACKUPS_EVENT, update) }
  }, [workspaceId, refresh])
  const run = async (backup?: WorkspaceBackup) => {
    if (pending.current) return
    pending.current = true; setStarting(true)
    try {
      const job = backup ? await restoreWorkspaceBackup(workspaceId, backup.id) : await createWorkspaceBackup(workspaceId)
      if (mounted.current) setStatus(previous => previous ? { ...previous, jobs: [job, ...previous.jobs] } : previous)
      await followWorkspaceBackup(showProgress, workspaceId, job)
      if (backup) onRestored()
    } catch (cause) {
      showToast({ title: 'Database operation did not complete', description: cause instanceof Error ? cause.message : String(cause), variant: 'destructive' })
    } finally {
      pending.current = false
      if (mounted.current) { setStarting(false); void refresh() }
    }
  }
  const busy = starting || Boolean(status?.jobs.some(job => job.status === 'running'))
  const latest = status?.jobs[0]
  return <div className="min-w-0 space-y-5">
    <section className="space-y-4 rounded border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Archive className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">Workspace checkpoints</h2>
        <Button variant="outline" size="sm" className="ml-auto" disabled={busy || !status || Boolean(error)} onClick={() => void run()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}Back up now
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Save a checkpoint before a bulk action. Each backup includes every document, relation and virtual tree placement in this workspace’s database.</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <span><strong>{status?.retention.hourly ?? 24}</strong> hourly backups</span>
        <span><strong>{status?.retention.startup ?? 14}</strong> startup backups</span>
        <span>Manual checkpoints kept</span>
      </div>
      <p className="text-xs text-muted-foreground">Hourly backups run while the workspace is active. These checkpoints cover the database only; files in storage backends and workspace settings need their own backups.</p>
    </section>
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">Verified checkpoints{status ? ` · ${status.backups.length}` : ''}</h2>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void refresh()} aria-label="Refresh backups"><RefreshCw className="h-4 w-4" /></Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {latest && <p role="status" className={`text-sm ${latest.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
      {latest.status === 'running' ? 'Database operation in progress…' : latest.status === 'failed' ? latest.error : latest.action === 'restore' ? 'Database restored. The workspace is stopped and ready to start.' : 'Backup complete and verified.'}
    </p>}
    {!status && !error && <p role="status" className="text-sm text-muted-foreground">Loading backups…</p>}
    {status?.backups.length === 0 && <p className="rounded border border-dashed p-6 text-sm text-muted-foreground">No verified checkpoints yet. Create one before your next bulk action.</p>}
    <div className="space-y-2">
      {status?.backups.map(backup => <article key={backup.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded border p-3">
        <Check className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Verified" />
        <div className="min-w-0 flex-1 basis-40">
          <p className="text-sm font-medium">{new Date(backup.createdAt).toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">{labels[backup.kind]} · {formatBytes(backup.bytes)} · {(backup.datasets.documents?.count ?? 0).toLocaleString()} documents</p>
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setSelected(backup)}><RotateCcw className="mr-2 h-3.5 w-3.5" />Restore</Button>
      </article>)}
    </div>
    <AlertDialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null) }}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Restore this workspace checkpoint?</AlertDialogTitle>
          <AlertDialogDescription>The workspace will stop and its current database will be backed up first. Documents, relations and virtual tree placements will return to {selected ? new Date(selected.createdAt).toLocaleString() : 'the selected checkpoint'}. Files in storage backends and workspace settings will stay as they are. The workspace stays stopped after restoration.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => { if (selected) void run(selected) }}>Back up current &amp; restore</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
