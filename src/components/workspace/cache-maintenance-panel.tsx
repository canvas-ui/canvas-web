import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Archive, Database, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { CACHE_ACTION_LABELS, CACHE_MAINTENANCE_EVENT, cacheJobSummary, followCacheMaintenance, getCacheMaintenance, isCacheJobActive, startCacheMaintenance, type CacheAction, type CacheMaintenanceStatus, type CacheStore } from '@/services/cache-maintenance'

export function CacheMaintenancePanel({ workspaceId, children }: { workspaceId: string; children?: ReactNode }) {
  const { showToast, showProgress } = useToast()
  const [status, setStatus] = useState<CacheMaintenanceStatus | null>(null)
  const [store, setStore] = useState<CacheStore>('workspace:cache')
  const [starting, setStarting] = useState(false)
  const [confirmVerify, setConfirmVerify] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const mounted = useRef(false)

  const refresh = useCallback(() =>
    getCacheMaintenance(workspaceId).then(next => {
      if (!mounted.current) return
      setStatus(next); setError(null)
      for (const job of next.jobs.filter(isCacheJobActive)) {
        void followCacheMaintenance(showProgress, workspaceId, job).catch(() => {})
      }
    }).catch(cause => {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Cannot load maintenance status')
    }), [workspaceId, showProgress])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const update = (event: Event) => {
      const { workspace, status: next } = (event as CustomEvent<{ workspace: string; status: CacheMaintenanceStatus }>).detail
      if (workspace === workspaceId) { setStatus(next); setError(null) }
    }
    window.addEventListener(CACHE_MAINTENANCE_EVENT, update)
    return () => { mounted.current = false; window.removeEventListener(CACHE_MAINTENANCE_EVENT, update) }
  }, [workspaceId, refresh])

  const run = async (action: CacheAction) => {
    if (pending.current || status?.jobs.some(isCacheJobActive)) return
    pending.current = true; setStarting(true)
    try {
      const job = await startCacheMaintenance(workspaceId, store, action)
      if (mounted.current) setStatus(previous => previous ? { ...previous, jobs: [job, ...previous.jobs.filter(item => item.id !== job.id)] } : previous)
      void followCacheMaintenance(showProgress, workspaceId, job).catch(() => {})
    } catch (cause) {
      showToast({ title: 'Could not start maintenance', description: cause instanceof Error ? cause.message : String(cause), variant: 'destructive' })
      void refresh()
    } finally {
      pending.current = false
      if (mounted.current) setStarting(false)
    }
  }
  const busy = starting || Boolean(status?.jobs.some(isCacheJobActive))
  const selected = status?.stores.find(item => item.id === store)
  const latest = status?.jobs[0]
  return (
    <section className="space-y-4 rounded-(--panel-radius) border p-4" aria-label="Workspace cache maintenance">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4 shrink-0" />Workspace cache</h2>
          <p className="mt-1 text-xs text-muted-foreground">Thumbnails, cached resources and pending transfers. Maintenance runs only when requested.</p>
        </div>
        {children && <fieldset disabled={busy}>{children}</fieldset>}
      </div>
      <div className="space-y-3 border-t pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="cache-maintenance-store" className="text-xs font-medium">Store</label>
          <select id="cache-maintenance-store" value={store} onChange={event => setStore(event.target.value as CacheStore)} disabled={busy}
            className="min-w-0 max-w-full rounded-md border bg-background px-2 py-1.5 text-xs">
            <option value="workspace:cache">workspace:cache</option>
            <option value="workspace:data">workspace:data</option>
          </select>
          <Button type="button" variant="ghost" size="icon" onClick={() => void refresh()} aria-label="Refresh cache maintenance status" className="ml-auto h-8 w-8"><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
        <p className="text-xs text-muted-foreground">{store === 'workspace:data' ? 'Managed document blobs. Referenced content is kept during collection.' : 'Working cache, including content awaiting transfer. Referenced content is kept during collection.'}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy || !selected?.canCollect || Boolean(error)} onClick={() => void run('collect')}><Trash2 className="mr-2 h-3.5 w-3.5" />Collect unused blobs</Button>
          <Button type="button" variant="outline" size="sm" disabled={busy || !selected?.canCompact || Boolean(error)} onClick={() => void run('compact')}><Archive className="mr-2 h-3.5 w-3.5" />Compact index</Button>
          <Button type="button" variant="outline" size="sm" disabled={busy || !selected?.canVerify || Boolean(error)} onClick={() => setConfirmVerify(true)}><ShieldCheck className="mr-2 h-3.5 w-3.5" />Verify integrity</Button>
        </div>
        <p className="text-xs text-muted-foreground">Collection removes unreferenced blobs. Compaction trims index history. Verification reads every blob and may remove corrupted content. Storage writes may wait during maintenance.</p>
        {!status && !error && <p className="text-xs text-muted-foreground" role="status">Loading maintenance status…</p>}
        {selected && !selected.canCollect && !selected.canVerify && !selected.canCompact && <p className="text-xs text-muted-foreground">Update canvas-stored to enable maintenance for this store.</p>}
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        {latest && <div className="rounded-md bg-muted/50 p-3 text-xs" role="status" aria-live="polite">
          <div className="flex items-center gap-2 font-medium">{isCacheJobActive(latest) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{CACHE_ACTION_LABELS[latest.action]} · {latest.store}</div>
          <p className={`mt-1 ${latest.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>{cacheJobSummary(latest)}</p>
          <p className="mt-1 text-muted-foreground">{latest.finishedAt ? `Finished ${new Date(latest.finishedAt).toLocaleString()}` : `Requested ${new Date(latest.createdAt).toLocaleString()}`}</p>
        </div>}
      </div>
      <AlertDialog open={confirmVerify} onOpenChange={setConfirmVerify}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader><AlertDialogTitle>Verify {store}?</AlertDialogTitle>
            <AlertDialogDescription>This reads all stored content and can take a long time. Corrupted blobs and their index entries may be removed. Keep a recovery backup before running it. Storage writes may wait until it finishes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => void run('verify')}>Verify and repair</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
