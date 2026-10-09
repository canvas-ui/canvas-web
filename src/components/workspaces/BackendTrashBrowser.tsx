import { useCallback, useEffect, useRef, useState } from 'react'
import { File, Folder, RefreshCw, RotateCcw, Trash2, MoreHorizontal } from 'lucide-react'
import { ContextMenuShell } from '@/components/common/context-menu-shell'
import { backendTrashLocation, backendTrashPath, backendTrashRows, type BackendTrashItem, type TrashRow } from '@/lib/backend-trash'
import { listBackendTrash, restoreBackendTrash, discardBackendTrash, confirmTrashDiscard } from '@/services/backend-trash'
import { listBackends } from '@/services/workspace'

interface TrashBrowserProps { workspace: string; path: string; onNavigate: (path: string) => void }

export function BackendTrashBrowser(props: TrashBrowserProps) {
  const backend = backendTrashLocation('backends', props.path)?.backend
  return <TrashBrowser key={JSON.stringify([props.workspace, backend])} {...props} />
}

function TrashBrowser({ workspace, path, onNavigate }: TrashBrowserProps) {
  const location = backendTrashLocation('backends', path)!
  const backend = location.backend
  const prefix = location.prefix
  const [page, setPage] = useState<{ revision: number; items: BackendTrashItem[]; backends: { address: string; label?: string }[]; days: number | null; error: string | null } | null>(null)
  const [busy, setBusy] = useState<'restore' | 'discard' | null>(null)
  const operationPending = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; row: TrashRow } | null>(null)
  const refresh = useCallback(() => setRevision(n => n + 1), [])

  const [previousPath, setPreviousPath] = useState(path)
  if (previousPath !== path) {
    setPreviousPath(path); setSelected(new Set()); setMenu(null); setMessage(null); setError(null)
  }
  const loading = page?.revision !== revision
  const items = loading ? [] : page.items
  const backends = loading ? [] : page.backends
  const days = page?.days
  useEffect(() => {
    let cancelled = false
    const load = backend ? listBackendTrash(workspace, backend).then(result => ({ ...result, backends: [] }))
      : listBackends(workspace).then(list => ({ items: [], days: null, backends: list.filter(b => b.driver === 'file' && b.enabled !== false) }))
    load.then(result => { if (!cancelled) setPage({ ...result, revision, error: null }) })
      .catch(e => { if (!cancelled) setPage({ revision, items: [], backends: [], days: null, error: e instanceof Error ? e.message : String(e) }) })
    return () => { cancelled = true }
  }, [workspace, backend, revision])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.workspaceName && detail.workspaceName !== workspace) return
      if (detail?.treeName && detail.treeName !== 'backends') return
      if (!timer) timer = setTimeout(() => { timer = null; refresh() }, 500)
    }
    window.addEventListener('workspace:trash:refresh', listener)
    window.addEventListener('workspace:tree:refresh', listener)
    return () => {
      window.removeEventListener('workspace:trash:refresh', listener)
      window.removeEventListener('workspace:tree:refresh', listener)
      if (timer) clearTimeout(timer)
    }
  }, [workspace, refresh])

  const rows = backendTrashRows(items, prefix)
  const mutate = async (action: 'restore' | 'discard', targets: BackendTrashItem[]) => {
    if (!backend || operationPending.current || loading || !targets.length) return
    if (action === 'discard' && !confirmTrashDiscard(backend, targets)) return
    operationPending.current = true
    setBusy(action); setError(null); setMessage(null); setMenu(null)
    try {
      // For repeated deletions of one path, the most recently deleted version
      // gets the original name. Older versions remain available in Trash.
      const results = await (action === 'restore' ? restoreBackendTrash : discardBackendTrash)(workspace, backend,
        [...targets].sort((a, b) => b.deletedAt - a.deletedAt).map(item => item.id))
      const failures = results.filter(result => !result.ok)
      setMessage(`${results.length - failures.length} item(s) ${action === 'restore' ? 'restored to their original paths' : 'permanently deleted'}.`)
      if (failures.length) setError(`${failures.length} item(s) remain in Trash. ${failures.slice(0, 3).map(r => `${r.key || 'Item'}: ${r.reason === 'precondition-failed' || r.reason === 'target-exists' ? 'original path is occupied' : r.message || r.reason}`).join('; ')}`)
      setSelected(new Set())
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { operationPending.current = false; setBusy(null); refresh() }
  }

  const openMenu = (x: number, y: number, row: TrashRow) => setMenu({ x, y, row })
  return <section className="flex h-full min-h-0 flex-col bg-background" aria-label="Backend Trash">
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
      <Trash2 className="h-4 w-4 text-muted-foreground" />
      <button className="text-sm font-medium hover:underline" onClick={() => onNavigate('/Trash')}>Trash</button>
      {backend && <><span className="text-muted-foreground">/</span><button className="text-sm hover:underline" onClick={() => onNavigate(backendTrashPath(backend))}>{backend}</button></>}
      {prefix.split('/').filter(Boolean).map((segment, i, parts) => <span key={i} className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">/</span>
        <button className="hover:underline" onClick={() => onNavigate(backendTrashPath(backend, parts.slice(0, i + 1).join('/')))}>{segment}</button>
      </span>)}
      <div className="ml-auto flex items-center gap-2">
        {selected.size > 0 && <><button className="flex items-center gap-1 rounded border px-2 py-1 text-sm disabled:opacity-50" disabled={Boolean(busy) || loading}
          onClick={() => void mutate('restore', rows.filter(row => selected.has(row.id)).flatMap(row => row.items))}><RotateCcw className="h-3.5 w-3.5" />Restore selected</button>
          <button className="flex items-center gap-1 rounded border px-2 py-1 text-sm text-destructive disabled:opacity-50" disabled={Boolean(busy) || loading}
            onClick={() => void mutate('discard', rows.filter(row => selected.has(row.id)).flatMap(row => row.items))}><Trash2 className="h-3.5 w-3.5" />Delete selected</button></>}
        {backend && rows.length > 0 && <button className="flex items-center gap-1 rounded border px-2 py-1 text-sm text-destructive disabled:opacity-50" disabled={Boolean(busy) || loading}
          onClick={() => void mutate('discard', rows.flatMap(row => row.items))}><Trash2 className="h-3.5 w-3.5" />{prefix ? 'Empty this folder' : 'Empty Trash'}</button>}
        <button title="Refresh Trash" aria-label="Refresh Trash" className="rounded p-2 hover:bg-accent" disabled={Boolean(busy) || loading} onClick={refresh}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
    </div>
    <div className="border-b px-4 py-2 text-xs text-muted-foreground">Restore files and folders to their original paths. Existing files are kept.{days ? ` Deleted items are kept for ${days} days.` : ''}</div>
    {message && <p role="status" className="px-4 py-2 text-sm">{message}</p>}
    {(error || page?.error) && <p role="alert" className="px-4 py-2 text-sm text-destructive">{error || page?.error}</p>}
    {busy && <p role="status" className="px-4 py-2 text-sm">{busy === 'restore' ? 'Restoring…' : 'Deleting permanently…'}</p>}
    <div className="min-h-0 flex-1 overflow-auto p-3">
      {loading ? <p className="p-4 text-sm text-muted-foreground">Loading Trash…</p> : !backend ?
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{backends.map(b => <button key={b.address}
          onClick={() => onNavigate(backendTrashPath(b.address))} className="flex items-center gap-3 rounded-lg border p-4 text-left hover:bg-accent">
          <Trash2 className="h-6 w-6 text-muted-foreground" /><span><span className="block text-sm font-medium">{b.label || b.address}</span><span className="text-xs text-muted-foreground">{b.address}</span></span>
        </button>)}{!backends.length && <p className="p-4 text-sm text-muted-foreground">No file backends are available.</p>}</div>
        : rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">This Trash folder is empty.</p> :
          <table className="w-full text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr>
            <th className="w-8 p-2"><input type="checkbox" aria-label="Select all visible items" checked={rows.length > 0 && rows.every(r => selected.has(r.id))}
              onChange={e => setSelected(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} /></th>
            <th className="p-2">Name</th><th className="p-2 max-sm:hidden">Original path</th><th className="p-2 max-md:hidden">Deleted</th><th className="p-2"><span className="sr-only">Actions</span></th>
          </tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/50 hover:bg-accent/50"
            onContextMenu={e => { e.preventDefault(); openMenu(e.clientX, e.clientY, row) }}
            onDoubleClick={() => row.navigable && onNavigate(backendTrashPath(backend, row.key))}>
            <td className="p-2"><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.id)} disabled={Boolean(busy)}
              onChange={e => setSelected(previous => { const next = new Set(previous); if (e.target.checked) next.add(row.id); else next.delete(row.id); return next })} /></td>
            <td className="p-2"><button className="flex items-center gap-2 text-left" onClick={() => row.navigable && onNavigate(backendTrashPath(backend, row.key))}>
              {row.directory ? <Folder className="h-4 w-4 shrink-0" /> : <File className="h-4 w-4 shrink-0" />}<span>{row.name}{row.navigable && <span className="ml-2 text-xs text-muted-foreground">{row.items.length} items</span>}</span></button></td>
            <td className="p-2 text-xs text-muted-foreground max-sm:hidden">{row.key}</td>
            <td className="p-2 text-xs text-muted-foreground max-md:hidden">{new Date(row.items.reduce((latest, item) => Math.max(latest, item.deletedAt), 0)).toLocaleString()}</td>
            <td className="p-2 text-right"><button title={`Actions for ${row.name}`} aria-label={`Actions for ${row.name}`} disabled={Boolean(busy)} className="rounded p-2 hover:bg-accent"
              onClick={e => openMenu(e.clientX, e.clientY, row)}><MoreHorizontal className="h-4 w-4" /></button></td>
          </tr>)}</tbody></table>}
    </div>
    {menu && <ContextMenuShell x={menu.x} y={menu.y} onClose={() => setMenu(null)} className="min-w-44 rounded-md border bg-popover p-1 shadow-elevation-3">
      {menu.row.navigable && <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-accent" onClick={() => { onNavigate(backendTrashPath(backend, menu.row.key)); setMenu(null) }}><Folder className="h-4 w-4" />Open folder</button>}
      <button disabled={Boolean(busy)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-accent disabled:opacity-50" onClick={() => void mutate('restore', menu.row.items)}><RotateCcw className="h-4 w-4" />Restore {menu.row.directory ? 'folder' : 'file'}</button>
      <button disabled={Boolean(busy) || loading} className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50" onClick={() => void mutate('discard', menu.row.items)}><Trash2 className="h-4 w-4" />Delete permanently</button>
    </ContextMenuShell>}
  </section>
}
