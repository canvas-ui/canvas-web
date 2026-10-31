import { useEffect, useState } from 'react'
import { Link2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentActionDialog } from '@/components/common/document-action-dialog'
import { LinkToCard } from './LinkToCard'
import { buildAutoLinkRules, type AutoLinkDirection, type AutoLinkDestination } from '@/lib/auto-link'
import { useToast } from '@/components/ui/use-toast'
import { addAutoLinkRule } from '@/services/hooks'
import { startRuleBackfill } from '@/services/rule-backfill'
import { listBackends, type Backend } from '@/services/workspace'
import { backendUploadTarget } from '@/lib/backend-upload'

function storageTarget(path: string, backends: Backend[]) {
  const target = backendUploadTarget(path, backends)
  if (backends.find(backend => backend.driver === target.driver && backend.address === target.address)?.capabilities.paths !== true) {
    throw new Error('This backend has not reported support for folder paths. Choose a writable storage folder to copy or move files here.')
  }
  return target
}

export function AutoLinkFolderPanel({ workspaceId, sourcePath, onClose, onManageRules }: {
  workspaceId: string
  sourcePath: string
  onClose: () => void
  onManageRules: () => void
}) {
  const [destinations, setDestinations] = useState<AutoLinkDestination[]>([])
  const [picker, setPicker] = useState(false)
  const [direction, setDirection] = useState<AutoLinkDirection>('forward')
  const canRecreateStructure = direction === 'forward' || !destinations.some(target => target.tree === 'context')
  const [mode, setMode] = useState<'copy' | 'move'>('copy')
  const [from, setFrom] = useState('')
  const [backends, setBackends] = useState<Backend[]>([])
  const [backendsLoading, setBackendsLoading] = useState(true)
  const [recursive, setRecursive] = useState(false)
  const [includeExisting, setIncludeExisting] = useState(true)
  const [ruleId] = useState(() => `autolink-${crypto.randomUUID()}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { showToast, showProgress } = useToast()
  const close = () => { if (!busy) onClose() }
  let reverseUnavailable = backendsLoading ? 'Checking whether this backend can receive files…' : ''
  if (!backendsLoading) {
    try { storageTarget(sourcePath, backends) }
    catch (err) { reverseUnavailable = err instanceof Error ? err.message : 'Choose a writable storage folder.' }
  }
  const changeDirection = (next: AutoLinkDirection) => {
    setDirection(next)
    if (next !== 'forward') {
      // Reverse mapping is for new arrivals unless the user opts into backfill.
      setIncludeExisting(false)
      if (destinations.some(target => target.tree === 'context')) setRecursive(false)
    }
  }
  const samplePath = (root: string) => `${root.replace(/\/+$/, '')}/${recursive ? 'Subfolder/' : ''}example.pdf`

  useEffect(() => {
    let cancelled = false
    listBackends(workspaceId).then(list => {
      if (!cancelled) setBackends(list)
    }).catch(() => { if (!cancelled) setError('Could not load storage backends. Reopen Autolink to retry.') })
      .finally(() => { if (!cancelled) setBackendsLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId])

  const save = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const storage = direction === 'forward' ? undefined : storageTarget(sourcePath, await listBackends(workspaceId))
      const rules = buildAutoLinkRules(ruleId, sourcePath, destinations, recursive, direction, mode, storage, from)
      await addAutoLinkRule(workspaceId, rules)
      if (includeExisting) void startRuleBackfill(showProgress, workspaceId, rules.map(rule => rule.id))
      else showToast({ title: 'Autolink enabled', description: 'Future documents are linked automatically.' })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not configure Auto-Link')
    } finally { setBusy(false) }
  }

  return <DocumentActionDialog label={picker ? 'Choose virtual paths' : 'Autolink documents'} onClose={picker ? () => setPicker(false) : close}>
    {picker ? <LinkToCard fixedWorkspaceName={workspaceId} tabs={direction !== 'forward' && recursive ? ['directory'] : ['context', 'directory']} initialTab={direction === 'forward' ? undefined : 'directory'} title="Choose virtual paths" confirmLabel="Add paths" sizeClassName="h-full w-full rounded-none border-0 shadow-none" onClose={() => setPicker(false)} onConfirm={(paths, target) => {
      if (direction !== 'forward' && target.treeType === 'context') setRecursive(false)
      setDestinations(prev => {
        const next = [...prev]
        for (const path of paths) if (!next.some(item => item.tree === target.treeType && item.path === path)) next.push({ tree: target.treeType, path })
        return next
      })
      setPicker(false)
    }} /> : <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Link2 className="h-5 w-5" />Autolink documents</h2>
          <button type="button" onClick={close} disabled={busy} aria-label="Close" className="p-1 disabled:opacity-40"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div><p className="text-xs text-muted-foreground">Current backend folder</p><p className="mt-1 break-words text-sm">backends:{sourcePath}</p></div>
          <fieldset disabled={busy} className="space-y-2 text-sm">
            <label className="block font-medium" htmlFor="autolink-direction">Direction</label>
            <select id="autolink-direction" className="w-full rounded-md border bg-background p-2" value={direction} onChange={e => changeDirection(e.target.value as AutoLinkDirection)}>
              <option value="forward">Backend → virtual folders (link)</option>
              <option value="reverse" disabled={!!reverseUnavailable}>Virtual folders → backend (Copy/Move)</option>
              <option value="both" disabled={!!reverseUnavailable}>Both directions</option>
            </select>
            <p className="text-xs text-muted-foreground">{direction === 'forward' ? 'Link documents from this backend folder into the selected virtual folders. Files stay where they are.' : `When a document is added or explicitly linked to a selected virtual folder, ${mode} its file to the current backend folder.${direction === 'both' ? ' Documents arriving on the backend are also linked into the virtual folders.' : ''}`}</p>
            {reverseUnavailable && <p className="text-xs text-muted-foreground">{backendsLoading ? reverseUnavailable : `Reverse mapping unavailable: ${reverseUnavailable}`}</p>}
            {direction !== 'forward' && <div className="space-y-2 rounded-lg border p-3">
              <label className="block font-medium" htmlFor="autolink-operation">File operation</label>
              <select id="autolink-operation" className="w-full rounded-md border bg-background p-2" value={mode} onChange={e => setMode(e.target.value as 'copy' | 'move')}>
                <option value="copy">Copy files to this backend</option>
                <option value="move">Move files to this backend</option>
              </select>
              {mode === 'copy' && <p className="text-xs text-muted-foreground">Keep the source file and its virtual-folder links.</p>}
              {mode === 'move' && <div className="mt-2 space-y-2">
                <label className="block" htmlFor="autolink-source-backend">Move files from</label>
                <select id="autolink-source-backend" className="w-full rounded-md border bg-background p-2" value={from} onChange={e => setFrom(e.target.value)}>
                  <option value="">Choose a source backend…</option>
                  {backends.filter(backend => backend.kind === 'storage' && backend.enabled && backend.config?.readOnly !== true).map(backend => <option key={backend.address} value={backend.address}>{backend.address}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Move the file from this source backend after it has been stored at the destination. Virtual-folder links stay in place. Files missing from this source are skipped; multiple source copies require Copy instead.</p>
              </div>}
            </div>}
          </fieldset>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{direction === 'reverse' ? 'Watch virtual folders' : 'Virtual folders'}</h3>
            {destinations.map((target, index) => <div key={`${target.tree}:${target.path}`} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <div className="min-w-0 flex-1"><span className="text-xs text-muted-foreground">{target.tree === 'context' ? 'Context tree' : 'Directory tree'}</span><p className="break-words">{target.path}</p></div>
              <button type="button" aria-label={`Remove ${target.tree}:${target.path}`} disabled={busy} onClick={() => setDestinations(prev => prev.filter((_, i) => i !== index))}><X className="h-4 w-4" /></button>
            </div>)}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setPicker(true)}><Plus className="mr-1 h-4 w-4" />Add virtual path…</Button>
            <p className="text-xs text-muted-foreground">{direction === 'forward' ? 'Choose the virtual folders where backend documents should appear.' : 'Choose a Directory tree folder to watch for newly added documents. Its files will be stored in the current backend folder.'}</p>
          </div>
          <fieldset disabled={busy} className="space-y-3 text-sm">
            <label className="flex items-start gap-2"><input type="checkbox" checked={recursive} disabled={!canRecreateStructure} onChange={e => setRecursive(e.target.checked)} className="mt-1" />Include subfolders and recreate their path in the destination</label>
            {!canRecreateStructure && <p className="text-xs text-muted-foreground">Context membership has no single folder path. To preserve subfolders on a backend, choose a directory source. Context paths store files directly in the selected backend folder.</p>}
            <label className="flex items-start gap-2"><input type="checkbox" checked={includeExisting} onChange={e => setIncludeExisting(e.target.checked)} className="mt-1" />Apply to existing documents</label>
          </fieldset>
          {!!destinations.length && <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm" aria-label="Mapping preview">
            <h3 className="font-medium">Example result</h3>
            {destinations.map(target => <div key={`preview:${target.tree}:${target.path}`} className="space-y-2 break-all text-xs">
              {direction !== 'reverse' && <p><span className="text-muted-foreground">Link </span>backends:{samplePath(sourcePath)}<br /><span className="text-muted-foreground">Into </span>{target.tree === 'context' ? 'ctx' : 'dir'}:{samplePath(target.path)}</p>}
              {direction !== 'forward' && <p><span className="text-muted-foreground">{mode === 'move' ? 'Move' : 'Copy'} </span>{target.tree === 'context' ? 'ctx' : 'dir'}:{samplePath(target.path)}<br /><span className="text-muted-foreground">To </span>backends:{samplePath(sourcePath)}</p>}
            </div>)}
            <p className="text-xs text-muted-foreground">{recursive ? 'The selected folders are the roots. Only the subfolder path beneath each root is recreated at its destination.' : 'Only direct folder contents are included.'}</p>
          </div>}
          <p className="text-xs text-muted-foreground">{includeExisting ? 'Existing matching documents are processed in the background on the server once enabled.' : direction === 'forward' ? 'Future backend arrivals and updates are linked automatically.' : 'Newly added or explicitly linked virtual-folder documents are processed automatically.'} {direction === 'both' && 'Both directions creates two rules in workspace Rules. '}Removing rules keeps existing files and links. Renames and deletions are not synchronized. Filename conflicts stop the transfer without overwriting.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t p-3">
          <Button variant="ghost" disabled={busy} onClick={onManageRules}>Manage rules</Button>
          <Button disabled={busy || !destinations.length || (direction !== 'forward' && (!!reverseUnavailable || (mode === 'move' && !from)))} onClick={save}>{busy ? 'Saving…' : 'Enable Autolink'}</Button>
        </div>
      </div>}
    </DocumentActionDialog>
}
