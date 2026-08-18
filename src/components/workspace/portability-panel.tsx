import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Package, Trash2, Upload, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import {
  deleteWorkspaceExport,
  downloadWorkspaceExport,
  exportWorkspace,
  formatBytes,
  importWorkspaceFromFile,
  listWorkspaceExports,
  startWorkspace,
  IMPORT_PHASE_LABELS,
  type ImportJob,
  type WorkspaceExportArchive,
} from '@/services/workspace'

/**
 * Workspace portability, in the General settings section.
 *
 * Export is stop -> tar -> publish: the workspace has to be stopped for its
 * index to be consistent on disk, so a running workspace is stopped first
 * (with consent) and the panel then offers to start it again. Archives are
 * published into the user's Exports dir and listed here with their size and a
 * download link.
 *
 * Import goes the other way: a file from the user's local drive is streamed
 * up, extracted into their Workspaces dir, validated and loaded. The three
 * server-side steps are one request — a half-imported workspace is not a
 * state worth exposing — so the progress shown is the upload, then a single
 * "extracting" phase for the rest.
 */
export function WorkspacePortabilitySection({
  workspaceId,
  workspaceName,
  isActive,
  onChanged,
}: {
  workspaceId: string
  workspaceName: string
  isActive: boolean
  onChanged?: () => void
}) {
  const { showToast } = useToast()
  const [archives, setArchives] = useState<WorkspaceExportArchive[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [stoppedByExport, setStoppedByExport] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [busyName, setBusyName] = useState<string | null>(null)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [importPhase, setImportPhase] = useState<'uploading' | 'server' | null>(null)
  const [serverPhase, setServerPhase] = useState<string>('')
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      setArchives(await listWorkspaceExports(workspaceId))
    } catch {
      // A workspace with no Exports dir yet is the normal empty case, not an
      // error worth a toast.
      setArchives([])
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  // Fetch on mount / workspace change. The lint rule fires on the setState
  // inside refresh(), which is the point of the effect — this IS the external
  // system synchronisation an effect is for.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh() }, [refresh])

  const handleExport = async () => {
    if (isActive && !window.confirm(
      `'${workspaceName}' is running. It has to be stopped to be exported — its index is only consistent on disk once it has flushed.\n\nStop it and export now?`,
    )) return

    setExporting(true)
    try {
      const archive = await exportWorkspace(workspaceId, { stop: true })
      setStoppedByExport(archive.stoppedWorkspace)
      showToast({
        title: 'Workspace exported',
        description: `${archive.name} — ${formatBytes(archive.size)}`,
      })
      await refresh()
      if (archive.stoppedWorkspace) onChanged?.()
    } catch (err) {
      showToast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Failed to export workspace',
        variant: 'destructive',
      })
    } finally {
      setExporting(false)
    }
  }

  const handleRestart = async () => {
    setRestarting(true)
    try {
      await startWorkspace(workspaceId)
      setStoppedByExport(false)
      showToast({ title: 'Workspace started', description: `'${workspaceName}' is running again.` })
      onChanged?.()
    } catch (err) {
      showToast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to start workspace',
        variant: 'destructive',
      })
    } finally {
      setRestarting(false)
    }
  }

  const handleDownload = async (archive: WorkspaceExportArchive) => {
    setBusyName(archive.name)
    try {
      await downloadWorkspaceExport(archive.name)
    } catch (err) {
      showToast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Failed to download archive',
        variant: 'destructive',
      })
    } finally {
      setBusyName(null)
    }
  }

  const handleDelete = async (archive: WorkspaceExportArchive) => {
    if (!window.confirm(`Delete ${archive.name}? The archive is removed from the server; any copy you already downloaded is untouched.`)) return
    setBusyName(archive.name)
    try {
      await deleteWorkspaceExport(archive.name)
      await refresh()
    } catch (err) {
      showToast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete archive',
        variant: 'destructive',
      })
    } finally {
      setBusyName(null)
    }
  }

  const handleImport = async (file: File) => {
    setImportPhase('uploading')
    setUploadPct(0)
    setServerPhase('')
    try {
      const workspace = await importWorkspaceFromFile(
        file,
        (fraction) => {
          setUploadPct(Math.round(fraction * 100))
          // bytes are up; the server now works through its own phases
          if (fraction >= 1) setImportPhase('server')
        },
        (job: ImportJob) => setServerPhase(IMPORT_PHASE_LABELS[job.phase] || job.phase),
      )
      showToast({
        title: 'Workspace imported',
        description: `'${workspace.label || workspace.name}' was extracted, validated and loaded.`,
      })
      onChanged?.()
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
    } catch (err) {
      showToast({
        title: 'Import failed',
        description: err instanceof Error ? err.message : 'Failed to import workspace',
        variant: 'destructive',
      })
    } finally {
      setImportPhase(null)
      setUploadPct(null)
      setServerPhase('')
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const importing = importPhase !== null

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Export &amp; Import</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Export packs this workspace into a single compressed archive you can download and move
        elsewhere. The workspace is stopped first — an export of a running workspace would capture a
        half-written index.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={exporting || importing} onClick={handleExport}>
          <Package className={`mr-2 h-3.5 w-3.5 ${exporting ? 'animate-pulse' : ''}`} />
          {exporting ? 'Exporting…' : 'Export Workspace'}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={loading || exporting} onClick={() => void refresh()}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        {stoppedByExport && (
          <Button type="button" variant="outline" size="sm" disabled={restarting} onClick={handleRestart}>
            {restarting ? 'Starting…' : 'Start workspace again'}
          </Button>
        )}
      </div>

      {/* Published archives */}
      <div className="mt-4 border-t pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Archives</h3>
        {loading ? (
          <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
        ) : archives.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No exports yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {archives.map(archive => (
              <li key={archive.name} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs">{archive.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatBytes(archive.size)} · {new Date(archive.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyName === archive.name}
                    onClick={() => handleDownload(archive)}
                    title={`Download (${formatBytes(archive.size)})`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyName === archive.name}
                    onClick={() => handleDelete(archive)}
                    className="text-destructive hover:text-destructive"
                    title="Delete archive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Import */}
      <div className="mt-4 border-t pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Import</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a workspace archive from your local drive. It is uploaded into your home, extracted
          into your Workspaces folder, validated and loaded as a new workspace.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".tar.gz,.tgz,.tar.bz2,.tbz2,.tbz,application/gzip,application/x-bzip2"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImport(file)
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={importing || exporting}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="mr-2 h-3.5 w-3.5" />
            Import from local drive…
          </Button>
          {importPhase === 'uploading' && (
            <span className="text-xs text-muted-foreground">Uploading… {uploadPct}%</span>
          )}
          {importPhase === 'server' && (
            <span className="text-xs text-muted-foreground">{serverPhase || 'Extracting, validating and loading…'}</span>
          )}
        </div>
      </div>
    </section>
  )
}
