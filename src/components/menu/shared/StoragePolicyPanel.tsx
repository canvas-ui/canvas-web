import { useEffect, useMemo, useState } from 'react'
import { FolderSync, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LinkToSidePanel, LINK_TO_SIDE_SIZE } from './LinkToSidePanel'
import { listBackends, type Backend } from '@/services/workspace'
import {
  DIRECTORY_CAPABLE_DRIVERS, applyStoragePolicyAll, defaultPolicyFolder, newStoragePolicyId, policyTargetBackends, upsertStoragePolicy, listStoragePolicies,
  type StoragePoliciesResponse, type StoragePolicy, type StoragePolicyFilter, type StoragePolicyTarget,
} from '@/services/storage-policies'
import { useEscapeClose } from '@/hooks/useEscapeClose'

type FilterKind = 'files' | 'images' | 'custom'

function filterKindOf(filter: StoragePolicyFilter | undefined): FilterKind {
  if (!filter || (!filter.mime && !filter.filename && (!filter.schema || filter.schema === 'file'))) return 'files'
  if (filter.mime === 'image/*' && !filter.filename && (!filter.schema || filter.schema === 'file')) return 'images'
  return 'custom'
}

function blankTarget(backend: Backend | undefined, folder: string): StoragePolicyTarget {
  return {
    backend: backend?.address ?? '',
    folder,
    recursive: true,
    recreateDirectories: !!backend && DIRECTORY_CAPABLE_DRIVERS.has(backend.driver),
    onConflict: 'error',
  }
}

export function StoragePolicyPanel({ workspaceId, path, policy, onClose, onSaved }: {
  workspaceId: string
  // Qualified virtual path, e.g. "ctx:/Architektúra" or "dir:/Invoices".
  path: string
  policy?: StoragePolicy
  onClose: () => void
  onSaved?: (policy: StoragePolicy) => void
}) {
  const editing = !!policy
  const [id] = useState(() => policy?.id ?? newStoragePolicyId())
  const [kind, setKind] = useState<'mirror' | 'filing'>(policy?.kind || 'mirror')
  const [description, setDescription] = useState(policy?.description ?? '')
  const [recursive, setRecursive] = useState(policy?.recursive ?? true)
  const [filterKind, setFilterKind] = useState<FilterKind>(() => filterKindOf(policy?.filter))
  const [mime, setMime] = useState(policy?.filter?.mime ?? '')
  const [filename, setFilename] = useState(policy?.filter?.filename ?? '')
  const [targets, setTargets] = useState<StoragePolicyTarget[]>(policy?.targets ?? [])
  const [snapshot, setSnapshot] = useState<StoragePoliciesResponse | null>(null)
  const [backends, setBackends] = useState<Backend[] | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [processed, setProcessed] = useState(0)
  const [folders, setFolders] = useState(0)
  const [failed, setFailed] = useState(0)
  useEscapeClose(onClose, !busy)
  const close = () => { if (!busy) onClose() }

  const folderDefault = useMemo(() => defaultPolicyFolder(path), [path])
  const candidates = useMemo(() => policyTargetBackends(backends ?? []).filter(b => kind === 'filing' || b.driver === 'file'), [backends, kind])
  const backendByName = useMemo(() => new Map(candidates.map(b => [b.address, b])), [candidates])

  useEffect(() => {
    let cancelled = false
    Promise.all([listBackends(workspaceId), listStoragePolicies(workspaceId)])
      .then(([list, current]) => {
        if (cancelled) return
        if (policy && JSON.stringify(current.policies.find(p => p.id === policy.id)) !== JSON.stringify(policy)) throw new Error('This policy changed. Close and reopen the editor.')
        setSnapshot(current)
        setBackends(list)
        // First target defaults to the first eligible backend when creating.
        const first = policyTargetBackends(list).find(b => policy?.kind === 'filing' || b.driver === 'file')
        if (first) setTargets(prev => (prev.length ? prev : [blankTarget(first, folderDefault)]))
      })
      .catch(err => { if (!cancelled) { setBackends([]); setError(err instanceof Error ? err.message : 'Could not load backends') } })
    return () => { cancelled = true }
  }, [workspaceId, folderDefault, policy])

  const updateTarget = (index: number, patch: Partial<StoragePolicyTarget>) =>
    setTargets(prev => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)))

  const changeBackend = (index: number, name: string) => {
    const backend = backendByName.get(name)
    const dirs = !!backend && DIRECTORY_CAPABLE_DRIVERS.has(backend.driver)
    updateTarget(index, { backend: name, recreateDirectories: dirs ? targets[index].recreateDirectories : false })
  }

  const buildPolicy = (): StoragePolicy => {
    if (!targets.length) throw new Error('Add at least one target.')
    const cleaned = targets.map(t => {
      if (!t.backend) throw new Error('Choose a backend for every target.')
      const target: StoragePolicyTarget = {
        backend: t.backend,
        folder: t.folder.trim().replace(/^\/+|\/+$/g, ''),
        recursive: t.recursive,
        recreateDirectories: t.recreateDirectories,
        onConflict: t.onConflict ?? 'error',
      }
      if (kind === 'filing' && t.key?.trim()) target.key = t.key.trim()
      if (kind === 'filing') target.recreateDirectories = false
      if (kind === 'mirror' && target.folder.includes('{{')) throw new Error('Folder templates require a filing policy.')
      return target
    })
    let filter: StoragePolicyFilter | undefined
    if (filterKind === 'images') filter = { schema: 'file', mime: 'image/*' }
    else if (filterKind === 'custom') {
      filter = { schema: 'file' }
      if (mime.trim()) filter.mime = mime.trim()
      if (filename.trim()) filter.filename = filename.trim()
    }
    return {
      id,
      kind,
      enabled: policy?.enabled ?? true,
      ...(description.trim() ? { description: description.trim() } : {}),
      path,
      recursive,
      ...(filter ? { filter } : {}),
      targets: cleaned,
    }
  }

  const save = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const next = buildPolicy()
      if (!saved) {
        await upsertStoragePolicy(workspaceId, next, snapshot!)
        setSaved(true)
        onSaved?.(next)
      }
      {
        setProcessed(0); setFolders(0); setFailed(0)
        await applyStoragePolicyAll(workspaceId, id, (_page, totals) => {
          setProcessed(totals.matched)
          setFolders(totals.folders)
          setFailed(totals.failed)
        })
        window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
        window.dispatchEvent(new CustomEvent('workspace:tree:refresh'))
      }
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the storage policy')
    } finally { setBusy(false) }
  }

  const canSave = !!snapshot && targets.length > 0 && targets.every(t => t.backend)

  return (
    <LinkToSidePanel onClose={close}>
      <section role="dialog" aria-modal="true" aria-labelledby="storage-policy-title" className={`${LINK_TO_SIDE_SIZE} flex flex-col overflow-hidden rounded-(--panel-radius) border bg-card shadow-elevation-4`}>
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <h2 id="storage-policy-title" className="flex items-center gap-2 text-sm font-medium"><FolderSync className="h-4 w-4" />{editing ? 'Edit storage policy' : 'Storage policy'}</h2>
          <button type="button" onClick={close} disabled={busy} aria-label="Close" className="p-1 disabled:opacity-40"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <div><p className="text-xs text-muted-foreground">Virtual path</p><p className="mt-1 break-words text-sm">{path}</p></div>
          <p className="text-xs text-muted-foreground">Documents filed here are copied to every target in order. Uploads stay local until every destination has been verified. Mirrors move removed copies to Trash; filing policies keep their copies.</p>

          <fieldset disabled={busy || saved} className="space-y-3 text-sm">
            <label className="block">Behavior<select aria-label="Storage behavior" className="ml-2 rounded border bg-background p-2" value={kind} onChange={e => setKind(e.target.value as 'mirror' | 'filing')}><option value="mirror">Mirror (recoverable removal)</option><option value="filing">File copies (keep after unlink)</option></select></label>
            <div>
              <label className="block text-xs text-muted-foreground" htmlFor="policy-description">Description (optional)</label>
              <input id="policy-description" className="mt-1 w-full rounded-md border bg-background p-2" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Accounting archive" />
            </div>
            <label className="flex items-start gap-2"><input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)} className="mt-1" />Apply to subfolders</label>
            <div>
              <label className="block text-xs text-muted-foreground" htmlFor="policy-filter">Documents</label>
              <select id="policy-filter" className="mt-1 w-full rounded-md border bg-background p-2" value={filterKind} onChange={e => setFilterKind(e.target.value as FilterKind)}>
                <option value="files">Files</option>
                <option value="images">Images</option>
                <option value="custom">Custom…</option>
              </select>
              {filterKind === 'custom' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input aria-label="MIME type" className="rounded-md border bg-background p-2" value={mime} onChange={e => setMime(e.target.value)} placeholder="image/*" />
                  <input aria-label="Filename glob" className="rounded-md border bg-background p-2" value={filename} onChange={e => setFilename(e.target.value)} placeholder="img*" />
                </div>
              )}
            </div>
          </fieldset>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Targets</h3>
            {backends === null && <p className="text-xs text-muted-foreground">Loading backends…</p>}
            {backends !== null && !candidates.length && <p className="text-xs text-destructive">No writable backend available. Add a folder or drive under Files &amp; storage first.</p>}
            {targets.map((target, index) => {
              const backend = backendByName.get(target.backend)
              const dirs = kind === 'mirror' && !!backend && DIRECTORY_CAPABLE_DRIVERS.has(backend.driver)
              return (
                <fieldset key={index} disabled={busy || saved} className="space-y-2 rounded-lg border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <select aria-label="Backend" className="min-w-0 flex-1 rounded-md border bg-background p-2" value={target.backend} onChange={e => changeBackend(index, e.target.value)}>
                      {!target.backend && <option value="">Choose a backend…</option>}
                      {candidates.map(b => <option key={b.address} value={b.address}>{b.address} ({b.driver})</option>)}
                      {target.backend && !backend && <option value={target.backend}>{target.backend} (unavailable)</option>}
                    </select>
                    <button type="button" aria-label="Remove target" onClick={() => setTargets(prev => prev.filter((_, i) => i !== index))} className="p-1 disabled:opacity-40"><X className="h-4 w-4" /></button>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground" htmlFor={`policy-folder-${index}`}>Folder on the backend</label>
                    <input id={`policy-folder-${index}`} className="mt-1 w-full rounded-md border bg-background p-2" value={target.folder} onChange={e => updateTarget(index, { folder: e.target.value })} placeholder="(backend root)" />
                  </div>
                  <label className="flex items-start gap-2"><input type="checkbox" checked={target.recursive} onChange={e => updateTarget(index, { recursive: e.target.checked })} className="mt-1" />Keep sub-folder structure</label>
                  <label className={`flex items-start gap-2 ${dirs ? '' : 'opacity-60'}`} title={dirs ? undefined : 'Empty folders require a mirror on a supported file backend.'}>
                    <input type="checkbox" checked={dirs && target.recreateDirectories} disabled={!dirs} onChange={e => updateTarget(index, { recreateDirectories: e.target.checked })} className="mt-1" />Create folders on the backend
                  </label>
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">Advanced</summary>
                    <div className="mt-2 space-y-2">
                      {kind === 'filing' && <div>
                        <label className="block text-xs text-muted-foreground" htmlFor={`policy-key-${index}`}>File-name template (optional)</label>
                        <input id={`policy-key-${index}`} className="mt-1 w-full rounded-md border bg-background p-2 font-mono text-xs" value={target.key ?? ''} onChange={e => updateTarget(index, { key: e.target.value })} placeholder="{{YYYY}}{{MM}}{{DD}}_{{basename}}{{ext}}" />
                      </div>}
                      <div>
                        <label className="block text-xs text-muted-foreground" htmlFor={`policy-conflict-${index}`}>On name conflict</label>
                        <select id={`policy-conflict-${index}`} className="mt-1 w-full rounded-md border bg-background p-2" value={target.onConflict ?? 'error'} onChange={e => updateTarget(index, { onConflict: e.target.value as StoragePolicyTarget['onConflict'] })}>
                          <option value="error">Stop with an error</option>
                          <option value="rename">Rename the new file</option>
                          {backend?.driver === 'file' && <option value="overwrite">Overwrite (retain previous bytes)</option>}
                        </select>
                      </div>
                    </div>
                  </details>
                </fieldset>
              )
            })}
            {!saved && <Button variant="outline" size="sm" disabled={busy || !candidates.length} onClick={() => setTargets(prev => [...prev, blankTarget(candidates.find(b => !prev.some(t => t.backend === b.address)) ?? candidates[0], folderDefault)])}><Plus className="mr-1 h-4 w-4" />Add target…</Button>}
          </div>

          <p className="text-xs text-muted-foreground">Applies to existing and future documents. Transfer progress and errors appear in Storage policies settings.</p>

          {busy && <p role="status" className="text-sm">{saved ? `Applying to existing documents… ${processed} planned, ${folders} folders` : 'Saving storage policy…'}</p>}
          {done && <p role="status" className="text-sm">Storage policy saved. {processed} documents and {folders} folders planned. Replication continues in the background.</p>}
          {failed > 0 && <p role="alert" className="text-sm text-destructive">{failed} document operations failed. Check operation status in Storage policies settings.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{saved ? 'The policy is saved. ' : ''}{error}</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t p-3">
          <Button variant="ghost" disabled={busy} onClick={close}>Cancel</Button>
          {done ? <Button onClick={onClose}>Done</Button> : <Button disabled={busy || !canSave} onClick={save}>{busy ? 'Applying…' : saved ? 'Retry existing documents' : editing ? 'Save policy' : 'Enable policy'}</Button>}
        </div>
      </section>
    </LinkToSidePanel>
  )
}
