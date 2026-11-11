import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { actOnRemovals, listRemovalOperations, type RemovalOperation } from '@/services/trash-operations'
import { RecentlyDeleted } from './recently-deleted'
import { BackendRemovalSettings } from './backend-removal-settings'
import { defaultRemovalPolicy, saveMailboxRemovalPolicy, type RemovalPolicy } from '@/services/trash-operations'
import { getWorkspace, listBackends, updateBackend, type Backend } from '@/services/workspace'
import { invalidateWorkspaceTreeCache } from '@/services/workspace'
import { canManageWorkspace } from '@/lib/workspace-access'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default TrashPanel


/**
 * The workspace Trash. "Recently deleted" is the list people come for: what
 * was deleted, where it was, how long it is kept, restore or delete forever.
 * "Source removals" holds the decisions about files that disappeared from a
 * backend or mailbox, and the log of what the removal policies did.
 */
export function TrashPanel({ workspaceName }: { workspaceName: string }) {
  return <WorkspaceTrash key={workspaceName} workspaceName={workspaceName} />
}

function WorkspaceTrash({ workspaceName }: { workspaceName: string }) {
  const [tab, setTab] = useState<'deleted' | 'removals'>('deleted')
  const [pending, setPending] = useState(0)
  const [access, setAccess] = useState({ write: false, admin: false })
  useEffect(() => {
    let live = true
    getWorkspace(workspaceName).then(ws => {
      const permissions = ws.remote?.permissions || ws.access?.permissions || (typeof ws.sharedVia === 'object' ? ws.sharedVia?.permissions : []) || []
      const admin = canManageWorkspace(ws)
      if (live) setAccess({ admin, write: admin || permissions.includes('write') })
    }).catch(() => {})
    listRemovalOperations(workspaceName, { view: 'pending', offset: 0 }).then(page => { if (live) setPending(page.total) }).catch(() => {})
    return () => { live = false }
  }, [workspaceName])
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Trash">
      <Button role="tab" aria-selected={tab === 'deleted'} size="sm" variant={tab === 'deleted' ? 'default' : 'outline'} onClick={() => setTab('deleted')}>Recently deleted</Button>
      <Button role="tab" aria-selected={tab === 'removals'} size="sm" variant={tab === 'removals' ? 'default' : 'outline'} onClick={() => setTab('removals')}>
        Source removals{pending > 0 ? ` (${pending} to review)` : ''}
      </Button>
    </div>
    {tab === 'deleted'
      ? <RecentlyDeleted workspaceName={workspaceName} canWrite={access.write} />
      : <SourceRemovals workspaceName={workspaceName} access={access} onPending={setPending} />}
  </div>
}

function SourceRemovals({ workspaceName, access, onPending }: { workspaceName: string; access: { write: boolean; admin: boolean }; onPending: (count: number) => void }) {
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
  const [backends, setBackends] = useState<Backend[]>([])
  const [editingPolicy, setEditingPolicy] = useState<RemovalOperation | null>(null)
  useEffect(() => { let live = true; listBackends(workspaceName).then(list => { if (live) setBackends(list) }).catch(() => {}); return () => { live = false } }, [workspaceName])
  useEffect(() => {
    let cancelled = false
    const load = () => listRemovalOperations(workspaceName, { view, search, ...(backend ? { backend } : {}), offset })
      .then(result => { if (!cancelled) { setPage(result); setError(''); if (view === 'pending' && !search && !backend) onPending(result.total) } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load Trash') })
    void load()
    const timer = setInterval(() => { if (!busy) void load() }, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [workspaceName, view, search, backend, offset, revision, busy, onPending])
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
    <p className="text-xs text-muted-foreground">Files that disappeared from a backend or mailbox. Decide what happens to the copies Canvas still holds, and see what the removal policies did.</p>
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Trash views">
      {([['pending', 'To review'], ['trashed', 'Recovery copies'], ['activity', 'Activity']] as const).map(([key, label]) => <Button key={key} role="tab" aria-selected={view === key} size="sm" variant={view === key ? 'default' : 'outline'} onClick={() => switchView(key)}>{label}</Button>)}
      <Button size="sm" variant="ghost" className="ml-auto" onClick={refresh} disabled={busy}><RefreshCw className="mr-2 h-3.5 w-3.5" />Refresh</Button>
    </div>
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
