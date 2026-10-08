import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { importWorkspaceFromFile, importWorkspaceFromPath, scanWorkspaceFolders, IMPORT_PHASE_LABELS, type ImportJob, type DiscoveredWorkspace, type WorkspaceScanReport } from '@/services/workspace'

function WorkspaceDiscovery({ disabled }: { disabled: boolean }) {
  const [scanId, setScanId] = useState(0)
  const [scanning, setScanning] = useState(true)
  const [found, setFound] = useState<DiscoveredWorkspace[]>([])
  const [report, setReport] = useState<WorkspaceScanReport | null>(null)
  const [error, setError] = useState('')
  // Reuse the mount request when React replays effects in Strict Mode: a
  // second scan would otherwise report no new folders after the first adds them.
  const request = useRef<{ id: number; promise: Promise<WorkspaceScanReport> } | null>(null)
  useEffect(() => {
    let active = true
    if (request.current?.id !== scanId) request.current = { id: scanId, promise: scanWorkspaceFolders() }
    void request.current.promise.then(result => {
      if (!active) return
      const discovered = [...result.discovered, ...result.adopted]
      setFound(previous => [...new Map([...previous, ...discovered].map(workspace => [workspace.id, workspace])).values()])
      setReport(result)
      if (discovered.length || result.updated.length || result.missing.length) window.dispatchEvent(new CustomEvent('workspaces:refresh'))
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'Workspace scan failed')
    }).finally(() => { if (active) setScanning(false) })
    return () => { active = false }
  }, [scanId])
  return <section className="space-y-2 rounded-md border p-3" aria-label="Find workspace folders">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-medium">Workspaces folder</h3>
        <p className="text-xs text-muted-foreground">Copied a workspace folder here? Scan to add it to your workspaces.</p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={disabled || scanning} onClick={() => {
        setScanning(true); setError(''); setScanId(previous => previous + 1)
      }}>
        <RefreshCw className={`mr-2 h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
        {scanning ? 'Scanning…' : 'Rescan'}
      </Button>
    </div>
    {scanning && <p role="status" className="text-sm text-muted-foreground">Looking for workspace folders…</p>}
    {!scanning && !error && <p role="status" className="text-sm">
      {found.length ? `Found ${found.length} ${found.length === 1 ? 'workspace' : 'workspaces'}. Added to your workspace list.` : 'No new workspace folders found.'}
    </p>}
    {found.length > 0 && <ul className="space-y-2">
      {found.map(workspace => <li key={workspace.id}>
        <Link className="text-sm font-medium underline underline-offset-2" to={`/workspaces/${encodeURIComponent(workspace.name)}`}>{workspace.label || workspace.name}</Link>
        <p className="break-all text-xs text-muted-foreground">{workspace.dir}</p>
      </li>)}
    </ul>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!!report?.skipped.length && <details className="text-sm text-muted-foreground">
      <summary>{report.skipped.length} {report.skipped.length === 1 ? 'folder could' : 'folders could'} not be added</summary>
      <ul className="mt-1 space-y-1">{report.skipped.map(folder => <li className="break-all" key={folder.dir}>{folder.dir}: {folder.reason}</li>)}</ul>
    </details>}
  </section>
}

export function WorkspaceImportIdentityFields({ name, label, setName, setLabel, disabled = false }: {
  name: string; label: string; setName: (value: string) => void; setLabel: (value: string) => void; disabled?: boolean
}) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="grid gap-1 text-sm">Workspace name
      <Input required pattern="[a-zA-Z0-9]([a-zA-Z0-9_]|-)*" placeholder="my-workspace" value={name} onChange={event => setName(event.target.value)} disabled={disabled} />
      <span className="text-xs text-muted-foreground">Used in addresses. Archive imports also use it as the folder name.</span>
    </label>
    <label className="grid gap-1 text-sm">Display label
      <Input required placeholder="My Workspace" value={label} onChange={event => setLabel(event.target.value)} disabled={disabled} />
    </label>
  </div>
}

export function WorkspaceImportForm({ onImported, disabled = false }: { onImported?: (workspace: Workspace) => void; disabled?: boolean }) {
  const [source, setSource] = useState<'upload' | 'path'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<Workspace | null>(null)
  const blocked = disabled || busy
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(''); setResult(null); setPhase('Starting…')
    const presentation = { name: name.trim(), label: label.trim() }
    const progress = (job: ImportJob) => setPhase(IMPORT_PHASE_LABELS[job.phase] || job.phase)
    try {
      const workspace = source === 'upload'
        ? await importWorkspaceFromFile(file!, fraction => setPhase(fraction < 1 ? `Uploading… ${Math.round(fraction * 100)}%` : 'Extracting…'), progress, presentation)
        : await importWorkspaceFromPath(path.trim(), presentation, progress)
      setResult(workspace)
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
      onImported?.(workspace)
    } catch (err) { setError(err instanceof Error ? err.message : 'Workspace import failed') }
    finally { setBusy(false) }
  }
  return <form className="space-y-3" onSubmit={event => void submit(event)}>
    <WorkspaceDiscovery disabled={blocked} />
    <label className="grid gap-1 text-sm">Import from
      <select value={source} disabled={blocked} onChange={event => setSource(event.target.value as typeof source)} className="rounded-md border bg-background p-2">
        <option value="upload">Upload an archive</option>
        <option value="path">Path on this server</option>
      </select>
    </label>
    {source === 'upload' ? <label className="grid gap-1 text-sm">Workspace archive
      <Input required type="file" accept=".tar.gz,.tgz,.tar.bz2,.tbz2,.tbz" disabled={blocked} onChange={event => setFile(event.target.files?.[0] || null)} />
    </label> : <label className="grid gap-1 text-sm">Server path
      <Input required placeholder="/tmp/workspace.tar.gz" value={path} disabled={blocked} onChange={event => setPath(event.target.value)} />
      <span className="text-xs text-muted-foreground">An archive or workspace folder on the server. Archives are extracted into your Workspaces directory.</span>
    </label>}
    <WorkspaceImportIdentityFields name={name} label={label} setName={setName} setLabel={setLabel} disabled={blocked} />
    <Button type="submit" disabled={blocked || !name.trim() || !label.trim() || (source === 'upload' ? !file : !path.trim())}>
      {busy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
      {busy ? 'Importing…' : 'Import workspace'}
    </Button>
    {busy && <p role="status" className="text-sm text-muted-foreground">{phase}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <p role="status" className="text-sm">Imported {result.label || result.name}.</p>}
  </form>
}
