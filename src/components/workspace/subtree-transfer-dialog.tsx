import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RefreshCw } from 'lucide-react'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { startSubtreeExport, startSubtreeImport, waitForSubtreeJob, type SubtreeArchive, type SubtreeJob, type SubtreeImportResult } from '@/services/subtree'

interface Options {
  mode: 'export' | 'import'
  workspaceId: string
  treeName: string
  path: string
  onImported: () => void
}

export function showSubtreeTransfer(options: Options): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const close = () => { root.unmount(); host.remove() }
  root.render(<SubtreeTransfer {...options} onClose={close} />)
}

// Mounted through the imperative helper above, like the workspace unlock dialog.
// eslint-disable-next-line react-refresh/only-export-components
function SubtreeTransfer({ mode, workspaceId, treeName, path, onImported, onClose }: Options & { onClose: () => void }) {
  const [dependencies, setDependencies] = useState<'related' | 'none'>('related')
  const [archive, setArchive] = useState<SubtreeArchive | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [job, setJob] = useState<SubtreeJob | null>(null)
  const imported = job?.status === 'done' && mode === 'import' ? job.result as SubtreeImportResult : null

  const load = async (file?: File) => {
    if (!file) return
    setBusy(true); setError(''); setArchive(null); setJob(null)
    try {
      if (file.size > 120 * 1024 * 1024) throw new Error('This export exceeds the 120 MB upload limit.')
      const data = JSON.parse(await file.text()) as SubtreeArchive
      if (data.format !== 'canvas-subtree' || data.version !== 1 || !Array.isArray(data.nodes) || !data.nodes[0] || !Array.isArray(data.documents)) throw new Error('Choose a Canvas subtree export file.')
      setArchive(data)
      setName(data.nodes[0].name === '/' ? data.source.tree.name : data.nodes[0].name)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read export') }
    finally { setBusy(false) }
  }
  const run = async () => {
    setBusy(true); setError('')
    try {
      const started = job?.status === 'running' ? job : mode === 'export'
        ? await startSubtreeExport(workspaceId, treeName, path, dependencies)
        : await startSubtreeImport(workspaceId, treeName, path, name, archive!)
      setJob(started)
      const finished = await waitForSubtreeJob(workspaceId, treeName, started.id, setJob)
      if (mode === 'export') setArchive(finished.result as SubtreeArchive)
      else onImported()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subtree transfer failed')
      if (mode === 'import') onImported()
    } finally { setBusy(false) }
  }
  const download = () => {
    if (!archive) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(archive)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${(archive.nodes[0].name === '/' ? archive.source.tree.name : archive.nodes[0].name).replace(/[^\p{L}\p{N}._-]/gu, '_')}.canvas-subtree.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const selectedCount = useMemo(() => archive ? new Set(archive.nodes.flatMap(node => node.documentIds)).size : 0, [archive])
  return <AlertDialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{mode === 'export' ? 'Export subtree' : 'Import subtree'}</AlertDialogTitle>
        <AlertDialogDescription>
          {mode === 'export' ? `${treeName}:${path}` : `Destination: ${treeName}:${path}`}. Includes document records, folder structure, and relationships. Physical files are copied separately.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {mode === 'export' && !archive && <label className="grid gap-2 text-sm">Include
        <select disabled={busy || job?.status === 'running'} value={dependencies} onChange={event => setDependencies(event.target.value as typeof dependencies)} className="rounded-md border bg-background p-2">
          <option value="related">Subtree + attachments and contacts</option>
          <option value="none">Subtree only</option>
        </select>
        <span className="text-xs text-muted-foreground">Supporting records keep their relationships. Their other folders, unrelated messages, and reply chains are excluded.</span>
      </label>}
      {mode === 'import' && !imported && <>
        <Input type="file" accept=".json,application/json" disabled={busy || job?.status === 'running'} aria-label="Subtree export file" onChange={event => void load(event.target.files?.[0])} />
        {archive && <label className="grid gap-2 text-sm">Folder name<Input value={name} disabled={busy || job?.status === 'running'} onChange={event => setName(event.target.value)} /></label>}
      </>}
      {archive && <p className="text-sm">{archive.nodes.length} folders, {selectedCount} subtree documents, and {archive.documents.length - selectedCount} supporting records.
        {archive.summary?.externalRelations > 0 && ` ${archive.summary.externalRelations} references point outside this export.`}
      </p>}
      {busy && <div role="status" className="flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4 animate-spin" />
        <span>{job ? `${job.phase.charAt(0).toUpperCase()}${job.phase.slice(1)}${job.total ? `: ${job.received} / ${job.total}` : '…'}` : 'Starting…'}</span>
      </div>}
      {imported && <div role="status" className="space-y-2 text-sm">
        <p>Imported {imported.documents} documents into {imported.path}. Reused {imported.reused} matching records.</p>
        <p>Copy the files into the destination backend and run its sync. Matching checksums reconnect the imported file records.</p>
        {imported.unresolvedRelations > 0 && <p>{imported.unresolvedRelations} external references were kept as migration metadata because their target records are not present.</p>}
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>Close</Button>
        {mode === 'export' && archive ? <Button onClick={download}>Download export</Button> : !imported &&
          <Button disabled={busy || (mode === 'import' && (!archive || !name.trim() || name.includes('/')))} onClick={() => void run()}>
            {error ? 'Retry' : mode === 'export' ? 'Create export' : 'Import subtree'}
          </Button>}
      </div>
    </AlertDialogContent>
  </AlertDialog>
}
