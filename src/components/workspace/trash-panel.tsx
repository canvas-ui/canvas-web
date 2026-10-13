import { useCallback, useEffect, useMemo, useState } from 'react'
import { RotateCcw, Trash2, RefreshCw } from 'lucide-react'

import { actOnRemovals, listRemovalOperations, type RemovalOperation } from '@/services/trash-operations'
import { BackendTrashBrowser } from '@/components/workspaces/BackendTrashBrowser'
import { BackendRemovalSettings } from './backend-removal-settings'
import { defaultRemovalPolicy, saveMailboxRemovalPolicy, type RemovalPolicy } from '@/services/trash-operations'
import { getWorkspace, listBackends, updateBackend, type Backend } from '@/services/workspace'
import { invalidateWorkspaceTreeCache } from '@/services/workspace'
import { canManageWorkspace } from '@/lib/workspace-access'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { emptyTrash, listTrash, restoreFromTrash, type TrashedDocument } from '@/services/workspace'

/**
 * The workspace trash.
 *
 * A filesystem-style delete (WebDAV, canvas-fuse, the remove action in this UI)
 * detaches a document from a path; if that was its LAST placement it lands here
 * instead of becoming reachable only through the whole-workspace list. So this
 * panel answers two questions: what did I lose track of, and where was it?
 *
 * Restoring re-files a document at every path it held when it was trashed.
 * Emptying is the one place the UI destroys — see docs/data-representation.md.
 */
function DocumentTrashPanel({ workspaceName, canWrite }: { workspaceName: string; canWrite: boolean }) {
  const { showToast } = useToast()
  const [documents, setDocuments] = useState<TrashedDocument[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [busyIds, setBusyIds] = useState<number[]>([])
  const [confirmingEmpty, setConfirmingEmpty] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setDocuments(await listTrash(workspaceName))
    } catch (err) {
      showToast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load the trash',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
    // showToast is stable enough for a manual refresh trigger; re-running on it
    // would reload the list on every toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceName])

  // Fetch on mount / workspace change. The lint rule fires on the setState
  // inside load(), which is the point of the effect — this IS the external
  // system synchronisation an effect is for.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const isBusy = useCallback((id: number) => busyIds.includes(id), [busyIds])

  const withBusy = async (ids: number[], fn: () => Promise<void>) => {
    setBusyIds(prev => [...prev, ...ids])
    try { await fn() } finally { setBusyIds(prev => prev.filter(id => !ids.includes(id))) }
  }

  const handleRestore = (document: TrashedDocument) => withBusy([document.id], async () => {
    try {
      const result = await restoreFromTrash(workspaceName, [document.id])
      if (result.failed?.length) {
        // The usual cause is a document trashed with no recorded target; it
        // stays in the trash rather than being stranded outside it.
        showToast({
          title: 'Not restored',
          description: result.failed[0]?.error || 'No restore target recorded',
          variant: 'destructive',
        })
      } else {
        showToast({ title: 'Restored', description: 'Document put back where it was.' })
        setDocuments(prev => prev.filter(doc => doc.id !== document.id))
      }
    } catch (err) {
      showToast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to restore',
        variant: 'destructive',
      })
    }
  })

  const handleDestroy = (document: TrashedDocument) => withBusy([document.id], async () => {
    try {
      const result = await emptyTrash(workspaceName, [document.id])
      if (result.failed?.length) throw new Error('The item could not be purged. Refresh and retry.')
      showToast({ title: 'Cleared from Trash', description: result.preserved?.length ? 'Existing backend copies remain indexed.' : 'Document permanently deleted.' })
      setDocuments(prev => prev.filter(doc => doc.id !== document.id))
    } catch (err) {
      showToast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete',
        variant: 'destructive',
      })
    }
  })

  const handleEmpty = async () => {
    if (!confirmingEmpty) { setConfirmingEmpty(true); return }
    setConfirmingEmpty(false)
    try {
      const result = await emptyTrash(workspaceName)
      showToast({ title: 'Trash emptied', description: `${result.destroyed?.length ?? 0} document(s) purged. ${result.preserved?.length ?? 0} item(s) cleared with backend copies preserved.` })
      await load()
    } catch (err) {
      showToast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to empty the trash',
        variant: 'destructive',
      })
    }
  }

  const rows = useMemo(() => documents.map(document => {
    const display = getDocumentDisplayInfo(document)
    const placements = document.trashed?.placements ?? []
    const origin = placements.flatMap(p => p.paths.map(path => `${p.tree}:${path}`))
    return { document, title: display.title, origin, trashedAt: document.trashed?.trashedAt || null }
  }), [documents])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-sm font-medium">Managed-tree items</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Restore managed-tree placements or permanently purge these items. Pending removals require separate approval. Backend copies are managed below.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 max-sm:flex-wrap">
          <Button variant="outline" size="sm" onClick={() => load()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant={confirmingEmpty ? 'destructive' : 'outline'}
            size="sm"
            onClick={handleEmpty}
            onBlur={() => setConfirmingEmpty(false)}
            disabled={!canWrite || documents.length === 0}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {confirmingEmpty ? 'Click again to delete everything' : 'Empty trash'}
          </Button>
        </div>
      </div>

      {isLoading && documents.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!isLoading && documents.length === 0 && (
        <p className="text-sm text-muted-foreground">The trash is empty.</p>
      )}

      {rows.length > 0 && (
        <div className="border rounded-md divide-y">
          {rows.map(({ document, title, origin, trashedAt }) => (
            <div key={document.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {origin.length > 0 ? `from ${origin.join(', ')}` : 'no recorded origin'}
                  {trashedAt ? ` · ${new Date(trashedAt).toLocaleString()}` : ''}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestore(document)}
                disabled={!canWrite || isBusy(document.id) || origin.length === 0}
                title={origin.length === 0 ? 'Nothing recorded to restore to' : 'Put it back where it was'}
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Restore placements
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDestroy(document)}
                disabled={!canWrite || isBusy(document.id)}
                title="Delete permanently"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TrashPanel


export function TrashPanel({ workspaceName }: { workspaceName: string }) {
  return <WorkspaceTrash key={workspaceName} workspaceName={workspaceName} />
}

function WorkspaceTrash({ workspaceName }: { workspaceName: string }) {
  const [view, setView] = useState<'pending' | 'trashed' | 'activity'>('pending')
  const [search, setSearch] = useState('')
  const [backend, setBackend] = useState('')
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState<{ operations: RemovalOperation[]; total: number } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [choices, setChoices] = useState<Record<string, { targets: string[]; membership: boolean }>>({})
  const [trashPath, setTrashPath] = useState('/Trash')
  const [backends, setBackends] = useState<Backend[]>([])
  const [access, setAccess] = useState({ write: false, admin: false })
  useEffect(() => {
    let live = true
    getWorkspace(workspaceName).then(ws => {
      const permissions = ws.remote?.permissions || ws.access?.permissions || (typeof ws.sharedVia === 'object' ? ws.sharedVia?.permissions : []) || []
      const admin = canManageWorkspace(ws)
      if (live) setAccess({ admin, write: admin || permissions.includes('write') })
    }).catch(() => {})
    return () => { live = false }
  }, [workspaceName])
  const [editingPolicy, setEditingPolicy] = useState<RemovalOperation | null>(null)
  useEffect(() => { let live = true; listBackends(workspaceName).then(list => { if (live) setBackends(list) }).catch(() => {}); return () => { live = false } }, [workspaceName])
  useEffect(() => {
    let cancelled = false
    const load = () => listRemovalOperations(workspaceName, { view, search, ...(backend ? { backend } : {}), offset })
      .then(result => { if (!cancelled) { setPage(result); setError('') } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load Trash') })
    void load()
    const timer = setInterval(() => { if (!busy) void load() }, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [workspaceName, view, search, backend, offset, revision, busy])
  const rows = page?.operations || []
  const refresh = () => { setSelected(new Set()); setRevision(n => n + 1) }
  const notify = () => {
    invalidateWorkspaceTreeCache(workspaceName)
    window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName } }))
    window.dispatchEvent(new CustomEvent('workspace:trash:refresh', { detail: { workspaceName } }))
  }
  const act = async (action: 'approve' | 'keep' | 'retry' | 'restore' | 'purge', ids = [...selected]) => {
    if (!ids.length || busy) return
    if (action === 'purge' && !window.confirm(`Permanently delete retained recovery copies for ${ids.length} operation(s)?`)) return
    setBusy(true); setError('')
    try {
      const results = action === 'approve'
        ? (await Promise.all(ids.map(id => actOnRemovals(workspaceName, [id], action, choices[id])))).flatMap(r => r.results)
        : (await actOnRemovals(workspaceName, ids, action)).results
      const failures = results.filter(r => !r.ok || r.operation?.state === 'failed')
      if (failures.length) setError(failures.map(r => r.error || r.operation?.error || 'A destination could not be changed. Expand the item for details.').join(' '))
      notify(); refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Trash action failed') }
    finally { setBusy(false) }
  }
  const switchView = (next: typeof view) => { setView(next); setOffset(0); setPage(null); setSelected(new Set()); setChoices({}) }
  return <div className="space-y-4">
    <div><h2 className="text-base font-semibold">Workspace Trash</h2><p className="text-xs text-muted-foreground mt-1">Review source removals, recover items, and see what automatic policies changed.</p></div>
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Trash views">
      {([['pending', 'Pending removal'], ['trashed', 'In Trash'], ['activity', 'Activity']] as const).map(([key, label]) => <Button key={key} role="tab" aria-selected={view === key} size="sm" variant={view === key ? 'default' : 'outline'} onClick={() => switchView(key)}>{label}</Button>)}
      <Button size="sm" variant="ghost" className="ml-auto" onClick={refresh} disabled={busy}><RefreshCw className="mr-2 h-3.5 w-3.5" />Refresh</Button>
    </div>
    {view === 'trashed' && <>
      <DocumentTrashPanel key={revision} workspaceName={workspaceName} canWrite={access.write} />
      <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Browse backend recovery copies</summary><div className="mt-3 min-h-48"><BackendTrashBrowser workspace={workspaceName} path={trashPath} onNavigate={setTrashPath} /></div></details>
    </>}
    <div className="flex flex-wrap gap-2">
      <Input aria-label="Filter Trash items" placeholder="Filter by item or path…" className="max-w-xs" value={search} onChange={e => { setSearch(e.target.value); setPage(null); setOffset(0); setSelected(new Set()) }} />
      <Input aria-label="Filter by backend" placeholder="Backend name…" className="max-w-56" value={backend} onChange={e => { setBackend(e.target.value); setPage(null); setOffset(0); setSelected(new Set()) }} />
      {selected.size > 0 && <div className="flex items-center gap-2 text-xs"><span>{selected.size} selected</span>
        {view === 'pending' && <><Button size="sm" disabled={busy} onClick={() => void act('approve')}>Approve selected</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void act('keep')}>Keep selected</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void act('retry')}>Retry</Button></>}
        {view === 'trashed' && <><Button size="sm" variant="outline" disabled={busy} onClick={() => void act('restore')}>Restore copies</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => void act('purge')}>Purge copies</Button></>}
      </div>}
    </div>
    {editingPolicy && <div className="rounded border p-3 space-y-2"><div className="flex items-center justify-between"><p className="text-sm font-medium">Removal policy · {editingPolicy.source.account || editingPolicy.source.backend}{editingPolicy.source.folder ? ` / ${editingPolicy.source.folder}` : ''}</p><Button size="sm" variant="ghost" onClick={() => setEditingPolicy(null)}>Close</Button></div>
      <BackendRemovalSettings key={editingPolicy.id} source={editingPolicy.source.backend} backends={backends} destination={false}
        value={{ ...defaultRemovalPolicy, ...(backends.find(b => b.address === editingPolicy.source.backend)?.config?.removalPolicy as RemovalPolicy),
          membership: (choices[editingPolicy.id]?.membership ?? editingPolicy.membership !== 'keep') ? 'review' : 'keep',
          propagation: editingPolicy.targets.length ? 'review' : 'never', targets: [...new Set(editingPolicy.targets.filter(t => !choices[editingPolicy.id] || choices[editingPolicy.id].targets.includes(JSON.stringify([t.backend, t.key]))).map(t => t.backend))] }}
        onSave={async removalPolicy => {
          if (editingPolicy.source.driver === 'imap') await saveMailboxRemovalPolicy(workspaceName, editingPolicy.source.account!, editingPolicy.source.folder!, removalPolicy)
          else await updateBackend(workspaceName, editingPolicy.source.driver, editingPolicy.source.backend, { removalPolicy })
          setBackends(await listBackends(workspaceName))
        }} />
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted"><tr><th className="p-3 w-8"><input type="checkbox" aria-label="Select visible operations" disabled={!access.write || busy || !rows.length || view === 'activity'} checked={rows.length > 0 && rows.every(r => selected.has(r.id))} onChange={e => setSelected(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} /></th><th className="p-3">Item and affected copies</th><th className="p-3">Source</th><th className="p-3">Status</th><th className="p-3">Detected</th></tr></thead>
        <tbody>{rows.map(op => {
          const choice = choices[op.id] || { targets: op.targets.filter(t => t.state !== 'kept').map(t => JSON.stringify([t.backend, t.key])), membership: op.membership !== 'keep' }
          return <tr key={op.id} className="border-t align-top">
            <td className="p-3"><input type="checkbox" aria-label={`Select ${op.title}`} disabled={!access.write || busy || view === 'activity'} checked={selected.has(op.id)} onChange={e => setSelected(prev => { const next = new Set(prev); if (e.target.checked) next.add(op.id); else next.delete(op.id); return next })} /></td>
            <td className="p-3 min-w-64"><details><summary className="cursor-pointer font-medium">{op.title}</summary>
              <div className="mt-2 space-y-2 text-muted-foreground">
                <p>{op.orphan ? 'No remaining byte locations. Restore placements only unless recovery bytes are available.' : `${op.remainingLocations.length} remaining location(s) when detected.`}</p>
                {op.placements.map(p => <p key={p.tree}>{p.tree}: {p.paths.join(', ')}</p>)}
                {op.membership !== 'keep' && <label className="flex items-center gap-2"><input type="checkbox" checked={choice.membership} disabled={busy || view !== 'pending' || op.membershipApplied} onChange={e => setChoices({ ...choices, [op.id]: { ...choice, membership: e.target.checked } })} />{op.membershipApplied ? 'Managed placements moved to Trash' : 'Move managed placements to Trash'}</label>}
                {op.targets.map(t => { const key = JSON.stringify([t.backend, t.key]); return <label key={key} className="flex items-start gap-2"><input type="checkbox" disabled={busy || view !== 'pending' || Boolean(t.trashId)} checked={choice.targets.includes(key)} onChange={e => setChoices({ ...choices, [op.id]: { ...choice, targets: e.target.checked ? [...choice.targets, key] : choice.targets.filter(k => k !== key) } })} /><span className="break-all">{t.backend}:{t.key} · {t.state}{t.error && <span className="block text-destructive">{t.error}</span>}</span></label> })}
                <Button size="sm" variant="outline" disabled={!access.admin} onClick={() => setEditingPolicy(op)}>Use these choices as a source policy</Button>
                {op.remainingLocations.map(l => <p className="break-all" key={l.url}>{l.url}</p>)}
              </div></details></td>
            <td className="p-3 break-all">{op.source.account || op.source.backend}{op.source.folder && <span className="block text-muted-foreground">{op.source.folder}</span>}</td>
            <td className="p-3">{op.state}{op.error && <p className="mt-1 max-w-xs text-destructive">{op.error}</p>}</td>
            <td className="p-3 whitespace-nowrap text-muted-foreground">{new Date(op.createdAt).toLocaleString()}</td>
          </tr>
        })}</tbody>
      </table>
      {!rows.length && <p className="p-5 text-center text-sm text-muted-foreground">{page ? 'No matching operations.' : 'Loading…'}</p>}
    </div>
    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{page?.total ?? 0} operation(s)</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!offset || busy} onClick={() => { setOffset(Math.max(0, offset - 200)); setSelected(new Set()) }}>Previous</Button><Button size="sm" variant="outline" disabled={offset + rows.length >= (page?.total ?? 0) || busy} onClick={() => { setOffset(offset + 200); setSelected(new Set()) }}>Next</Button></div></div>
  </div>
}
