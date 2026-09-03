import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Download, Trash2, Database, HardDrive, Mail, Globe, FileQuestion, Pencil, Brush, PenLine, ArrowRight } from 'lucide-react'
import { BackendActionCard, type BackendTransferConfirmOptions } from '@/components/menu/shared/BackendActionCard'
import { Button } from '@/components/ui/button'
import { DocumentRenderer } from '@/components/renderers/registry'
import {
  getDocumentLocations, getDocumentMemberships, destroyWorkspaceDocuments, downloadDocument,
  transferDocumentsToBackends,
  type DocumentLocationInfo, type DocumentTreeMembership, type BackendTransferMode,
} from '@/services/workspace'
import { getLocationFilename } from '@/lib/document-display'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { usePublicShareCode } from '@/components/renderers/public-share'
import { DocumentEditForm } from './EditForm'
import { DocumentRelationsSection } from './RelationsSection'
import { isEditableDocument } from './editable-schema'
import { LazySketchEditor } from '@/components/editors/sketch-lazy'
import { LazyTextDocumentEditor } from '@/components/editors/text-lazy'
import { DRAWING_SCHEMA, NOTE_SCHEMA } from '@/components/renderers/types'
import { isTextBackedFile } from '@/lib/text-document'
import type { Document } from '@/types/workspace'

interface TabProps {
  document: Document
  workspaceId: string
  onChanged?: () => void
}

// ── View/Edit ────────────────────────────────────────────────────────────────

export function ViewTab({ document, workspaceId, initialEdit = false, onChanged }: TabProps & { initialEdit?: boolean }) {
  const isPublic = usePublicShareCode() != null
  const { showErrorToast } = useToastHelpers()
  // Every non-public document is editable — at minimum the universal comment
  // section; schema-specific fields (url/title/body) render only for note/link/tab.
  const canEdit = !isPublic
  const [editing, setEditing] = useState(initialEdit && isEditableDocument(document))
  // Drawings get a real content editor (full-viewport Excalidraw overlay) on
  // top of the metadata form — "Edit" alone would only offer comment/tags.
  const isDrawing = document.schema === DRAWING_SCHEMA
  const [sketchOpen, setSketchOpen] = useState(false)
  // Notes, markdown files and text files open in the same kind of full
  // surface a sketch does — "Edit" alone would only offer comment/tags.
  const hasTextEditor = document.schema === NOTE_SCHEMA || isTextBackedFile(document)
  const [textEditorOpen, setTextEditorOpen] = useState(false)
  // Render-time state reset: switching documents re-seeds the edit mode.
  const resetKey = `${document.id}:${initialEdit}`
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setEditing(initialEdit && isEditableDocument(document))
  }

  if (editing && canEdit) {
    return (
      <DocumentEditForm
        document={document}
        workspaceId={workspaceId}
        onClose={() => { setEditing(false); onChanged?.() }}
      />
    )
  }
  return (
    // Fill the host's definite height (modal/side card) as a flex column: the
    // renderer gets a flex-1 scroll area, so height-filling viewers (PDF) can be
    // h-full and long content scrolls, while the Edit button / comment stay put.
    <div className="flex h-full min-h-0 flex-col gap-3">
      {canEdit && (
        <div className="flex shrink-0 justify-end gap-2">
          {/* Best-copy download (server picks the first reachable location);
              the Storage tab keeps its per-location download buttons. */}
          {document.schema === 'data/schema/file' && (
            <Button
              variant="outline" size="sm"
              onClick={() => downloadDocument(workspaceId, document.id, getLocationFilename(document) || `document-${document.id}`)
                .catch((e) => showErrorToast(e instanceof Error ? e.message : String(e)))}
            >
              <Download className="mr-1 h-3 w-3" /> Download
            </Button>
          )}
          {isDrawing && (
            <Button variant="outline" size="sm" onClick={() => setSketchOpen(true)}>
              <Brush className="mr-1 h-3 w-3" /> Edit sketch
            </Button>
          )}
          {hasTextEditor && (
            <Button variant="outline" size="sm" onClick={() => setTextEditorOpen(true)}>
              <PenLine className="mr-1 h-3 w-3" /> Open editor
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>
        </div>
      )}
      {sketchOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-fullscreen flex items-center justify-center bg-background surface-glass">
            <p className="text-sm text-muted-foreground">Loading sketch editor…</p>
          </div>
        }>
          <LazySketchEditor
            doc={document}
            workspaceName={workspaceId}
            onSaved={() => { setSketchOpen(false); onChanged?.() }}
            onClose={() => setSketchOpen(false)}
            onDetails={() => { setSketchOpen(false); setEditing(true) }}
          />
        </Suspense>
      )}
      {textEditorOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-fullscreen flex items-center justify-center bg-background surface-glass">
            <p className="text-sm text-muted-foreground">Loading editor…</p>
          </div>
        }>
          <LazyTextDocumentEditor
            doc={document}
            workspaceName={workspaceId}
            onSaved={() => { setTextEditorOpen(false); onChanged?.() }}
            onClose={() => setTextEditorOpen(false)}
            onDetails={() => { setTextEditorOpen(false); setEditing(true) }}
          />
        </Suspense>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <DocumentRenderer workspaceId={workspaceId} document={document} />
      </div>
      {document.comment?.trim() && (
        <div className="shrink-0 rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Comment</p>
          <p className="text-sm whitespace-pre-wrap">{document.comment}</p>
        </div>
      )}
    </div>
  )
}

// ── Metadata ────────────────────────────────────────────────────────────────

const formatDate = (dateString?: string) => {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

// Extracted image metadata (EXIF/GPS/dimensions) — populated by the stored
// ingest pipeline for photos. Optional and best-effort; render only what's set.
interface ImageMeta {
  geo?: { lat?: number; lon?: number; alt?: number }
  exif?: {
    make?: string; model?: string; lensModel?: string; orientation?: string
    iso?: number; fNumber?: number; exposureTime?: number; focalLength?: number
    capturedAt?: string
  }
  dimensions?: { width?: number; height?: number; type?: string; orientation?: number }
}

// 1/1250-style shutter label from a fractional-second exposure.
const formatExposure = (s?: number) => {
  if (!Number.isFinite(s) || !s) return null
  return s >= 1 ? `${s}s` : `1/${Math.round(1 / (s as number))}s`
}

function PhotoMetadata({ meta }: { meta: ImageMeta }) {
  const { geo, exif, dimensions } = meta
  if (!geo && !exif && !dimensions) return null
  const row = (label: string, value: ReactNode) =>
    value == null || value === '' ? null : (
      <div><span className="font-medium">{label}:</span><span className="ml-2">{value}</span></div>
    )

  return (
    <div>
      <h3 className="font-semibold mb-3">Photo</h3>
      <div className="grid gap-3 text-sm">
        {dimensions && row('Dimensions', dimensions.width && dimensions.height ? `${dimensions.width} × ${dimensions.height}` : null)}
        {exif && row('Camera', [exif.make, exif.model].filter(Boolean).join(' '))}
        {exif && row('Lens', exif.lensModel)}
        {exif && row('Aperture', Number.isFinite(exif.fNumber) ? `ƒ/${exif.fNumber}` : null)}
        {exif && row('Shutter', formatExposure(exif.exposureTime))}
        {exif && row('ISO', Number.isFinite(exif.iso) ? exif.iso : null)}
        {exif && row('Focal length', Number.isFinite(exif.focalLength) ? `${exif.focalLength} mm` : null)}
        {exif && row('Captured', formatDate(exif.capturedAt))}
        {geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lon) && row('Location', (
          <a
            href={`https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lon}#map=15/${geo.lat}/${geo.lon}`}
            target="_blank" rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {geo.lat!.toFixed(5)}, {geo.lon!.toFixed(5)}{Number.isFinite(geo.alt) ? ` · ${Math.round(geo.alt as number)} m` : ''}
          </a>
        ))}
      </div>
    </div>
  )
}

export function MetadataTab({ document }: TabProps) {
  const imageMeta = document.metadata as unknown as ImageMeta
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3">Basic Information</h3>
        <div className="grid gap-3 text-sm">
          <div><span className="font-medium">ID:</span><span className="ml-2 font-mono">{document.id}</span></div>
          <div><span className="font-medium">Schema:</span><span className="ml-2 font-mono">{document.schema}</span></div>
          <div><span className="font-medium">Schema Version:</span><span className="ml-2">{document.schemaVersion}</span></div>
          <div><span className="font-medium">Created:</span><span className="ml-2">{formatDate(document.createdAt)}</span></div>
          <div><span className="font-medium">Updated:</span><span className="ml-2">{formatDate(document.updatedAt)}</span></div>
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3">Metadata</h3>
        <div className="grid gap-3 text-sm">
          <div><span className="font-medium">Content Type:</span><span className="ml-2">{document.metadata?.contentType ?? '—'}</span></div>
          <div><span className="font-medium">Content Encoding:</span><span className="ml-2">{document.metadata?.contentEncoding ?? '—'}</span></div>
          {Number.isFinite(document.metadata?.size) && (
            <div><span className="font-medium">Size:</span><span className="ml-2">{document.metadata?.size} bytes</span></div>
          )}
        </div>
      </div>

      <PhotoMetadata meta={imageMeta} />

      {Array.isArray(document.locations) && document.locations.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Locations</h3>
          <div className="space-y-2">
            {document.locations.map((loc, index) => {
              const { backend, key } = splitUrl(loc.url)
              return (
                <div key={index} className="flex items-baseline gap-2 text-sm font-mono">
                  <span className="font-medium shrink-0">{backend}</span>
                  {key && <span className="break-all text-muted-foreground">{key}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {Array.isArray(document.checksumArray) && document.checksumArray.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Checksums</h3>
          <div className="space-y-2">
            {document.checksumArray.map((checksum, index) => {
              const [algo, hash] = checksum.split('/')
              return (
                <div key={index} className="flex items-center gap-2 text-sm font-mono">
                  <span className="font-medium">{algo}:</span>
                  <span className="break-all text-muted-foreground">{hash}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {document.indexOptions && (
        <div>
          <h3 className="font-semibold mb-3">Index Options</h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-medium">FTS Search Fields:</span>
              <div className="ml-2 mt-1">{(document.indexOptions.ftsSearchFields ?? []).map((field, index) => (<span key={index} className="mb-1 mr-2 inline-block rounded bg-muted px-2 py-1 text-xs">{field}</span>))}</div>
            </div>
            <div>
              <span className="font-medium">Vector Embedding Fields:</span>
              <div className="ml-2 mt-1">{(document.indexOptions.vectorEmbeddingFields ?? []).map((field, index) => (<span key={index} className="mb-1 mr-2 inline-block rounded bg-muted px-2 py-1 text-xs">{field}</span>))}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── JSON ────────────────────────────────────────────────────────────────────

export function JsonTab({ document }: TabProps) {
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const json = JSON.stringify(document, null, 2)
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); showSuccessToast('Copied to clipboard') }
    catch { showErrorToast('Copy failed') }
  }
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={copy}>
          <Copy className="mr-1 h-3 w-3" /> Copy to clipboard
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{json}</pre>
    </div>
  )
}

// ── Synapses (tree memberships) ─────────────────────────────────────────────

export function SynapsesTab({ document, workspaceId }: TabProps) {
  const [memberships, setMemberships] = useState<DocumentTreeMembership[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Render-time reset when the target document changes.
  const fetchKey = `${workspaceId}:${document.id}`
  const [lastKey, setLastKey] = useState(fetchKey)
  if (fetchKey !== lastKey) {
    setLastKey(fetchKey)
    setMemberships(null)
    setError(null)
  }

  useEffect(() => {
    let cancelled = false
    getDocumentMemberships(workspaceId, document.id)
      .then((m) => { if (!cancelled) setMemberships(m) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!memberships) return <p className="text-sm text-muted-foreground">Loading memberships...</p>

  const groups: { title: string; type: string }[] = [
    { title: 'Context tree', type: 'context' },
    { title: 'Directory tree', type: 'directory' },
  ]

  return (
    <div className="space-y-6">
      {groups.map(({ title, type }) => {
        const trees = memberships.filter((m) => m.type === type)
        const paths = trees.flatMap((m) => m.paths.map((p) => ({ tree: m.tree, path: p })))
        return (
          <div key={type}>
            <h3 className="mb-3 font-semibold">{title}</h3>
            {paths.length === 0
              ? <p className="text-sm text-muted-foreground">No placements.</p>
              : (
                <div className="space-y-1">
                  {paths.map(({ tree, path }, i) => (
                    <div key={`${tree}:${path}:${i}`} className="flex items-center gap-2 text-sm">
                      <span className="break-all font-mono text-xs">{path}</span>
                      {trees.length > 1 && <span className="shrink-0 text-xs text-muted-foreground">({tree})</span>}
                    </div>
                  ))}
                </div>
              )}
          </div>
        )
      })}
      {/* Typed doc<->doc edges — the other half of "what is this connected
          to", alongside the tree placements above. */}
      <DocumentRelationsSection document={document} workspaceId={workspaceId} />
    </div>
  )
}

// ── Backends ────────────────────────────────────────────────────────────────

function kindIcon(kind: string) {
  if (kind === 'stored') return Database
  if (kind === 'workspace-file') return HardDrive
  if (kind === 'imap') return Mail
  if (kind === 'readonly') return Globe
  return FileQuestion
}

// Split a location URL into backend + key for display (stored://<backend>/<key>).
function splitUrl(url: string): { backend: string; key: string } {
  const m = url.match(/^([a-z][a-z0-9+.-]*):\/\/([^/]*)\/?(.*)$/i)
  if (!m) return { backend: url, key: '' }
  return { backend: `${m[1]}://${m[2]}`, key: m[3] }
}

export function BackendsTab({ document, workspaceId, onChanged }: TabProps) {
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const [locations, setLocations] = useState<DocumentLocationInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyUrl, setBusyUrl] = useState<string | null>(null)
  // URL awaiting the "last location" decision (remove index entry vs keep it).
  const [confirmLastUrl, setConfirmLastUrl] = useState<string | null>(null)
  // "Copy to… / Move to…" card — same card the document list uses, for one doc.
  const [transferMode, setTransferMode] = useState<BackendTransferMode | null>(null)
  const [transferSaving, setTransferSaving] = useState(false)

  // Render-time reset when the target document changes.
  const fetchKey = `${workspaceId}:${document.id}`
  const [lastKey, setLastKey] = useState(fetchKey)
  if (fetchKey !== lastKey) {
    setLastKey(fetchKey)
    setLocations(null)
    setError(null)
    setConfirmLastUrl(null)
  }

  const reload = () => {
    getDocumentLocations(workspaceId, document.id)
      .then(setLocations)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(() => {
    let cancelled = false
    getDocumentLocations(workspaceId, document.id)
      .then((l) => { if (!cancelled) setLocations(l) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey])

  const removeFromBackend = async (url: string, keepDocument?: boolean) => {
    setBusyUrl(url)
    setConfirmLastUrl(null)
    try {
      const result = await destroyWorkspaceDocuments(workspaceId, [document.id], {
        urls: [url],
        ...(keepDocument !== undefined ? { keepDocument } : {}),
      })
      const outcome = result.successful[0]
      if (!outcome) throw new Error(result.failed[0]?.reason || 'Destroy failed')
      if (outcome.docDeleted) {
        showSuccessToast('Removed from backend; document removed from index')
      } else if (outcome.deleted.includes(url)) {
        showSuccessToast('Removed from backend')
      } else {
        showSuccessToast('Reference dropped (backend is read-only)')
      }
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
      onChanged?.()
      reload()
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyUrl(null)
    }
  }

  const transfer = async (backends: string[], mode: BackendTransferMode, options: BackendTransferConfirmOptions) => {
    setTransferSaving(true)
    try {
      const result = await transferDocumentsToBackends(workspaceId, [document.id], {
        to: backends,
        mode,
        keepDocument: options.keepDocument,
        folder: options.folder,
        filename: options.filename,
        onConflict: options.onConflict,
      })
      const outcome = result.successful[0]
      if (!outcome) throw new Error(result.failed[0]?.reason || 'Transfer failed')
      const landed = outcome.transfers?.flatMap(t => t.state === 'unchanged' ? [] : [t.backend]) ?? []
      const where = backends.join(', ')
      if (mode === 'delete') showSuccessToast(`Deleted from ${where}`)
      else if (landed.length === 0) showSuccessToast(`Nothing to do — already on ${where}`)
      else showSuccessToast(`${mode === 'move' ? 'Moved to' : 'Copied to'} ${landed.join(', ')}${outcome.transfers?.some(t => t.state === 'pending') ? ' (pending sync)' : ''}`)
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
      setTransferMode(null)
      onChanged?.()
      reload()
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : String(e))
    } finally {
      setTransferSaving(false)
    }
  }

  const onRemoveClick = (loc: DocumentLocationInfo) => {
    const isLast = (locations?.length ?? 0) <= 1
    if (isLast) { setConfirmLastUrl(loc.url); return }
    if (window.confirm(`Remove this copy from the backend?\n\n${loc.url}`)) {
      void removeFromBackend(loc.url)
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!locations) return <p className="text-sm text-muted-foreground">Loading locations...</p>

  const isJsonDoc = locations.length === 0
  const filename = getLocationFilename(document)

  return (
    <div className="space-y-3">
      {/* The index entry itself — JSON docs (notes, tabs, emails' metadata)
          live in the workspace db even when no byte locations exist. */}
      <div className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
        <span className="inline-flex min-w-0 items-center gap-2">
          <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-mono text-xs">workspace:db</span>
          <span className="truncate text-xs text-muted-foreground">index entry (id {document.id})</span>
        </span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">json</span>
      </div>

      {isJsonDoc ? (
        <p className="text-sm text-muted-foreground">No byte locations; this object lives only in the workspace database, so there is no file data to copy or move.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTransferMode('copy')} title="Copy the file data to another storage backend (keeps the existing copies)">
            <Copy className="mr-1 h-3.5 w-3.5" /> Copy to…
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransferMode('move')} title="Move the file data to another storage backend (source released once the copy is durable)">
            <ArrowRight className="mr-1 h-3.5 w-3.5" /> Move to…
          </Button>
        </div>
      )}

      {locations.map((loc) => {
        const Icon = kindIcon(loc.kind)
        const { backend, key } = splitUrl(loc.url)
        const busy = busyUrl === loc.url
        return (
          <div key={loc.url} className="space-y-2 rounded border px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="shrink-0 font-mono text-xs">{loc.backend || backend}</span>
                <span className="truncate font-mono text-xs text-muted-foreground" title={loc.url}>{key || loc.url}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${loc.deletable ? 'bg-muted text-muted-foreground' : 'bg-warning/15 text-warning'}`}>
                  {loc.deletable ? loc.kind : 'read-only'}
                </span>
                <button
                  onClick={() => downloadDocument(workspaceId, document.id, filename || `document-${document.id}`, { url: loc.url }).catch((e) => showErrorToast(e instanceof Error ? e.message : String(e)))}
                  className="text-muted-foreground hover:text-foreground"
                  title="Download this copy"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onRemoveClick(loc)}
                  disabled={busy}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  title={loc.deletable ? 'Remove from backend' : 'Drop reference (bytes stay; backend is read-only)'}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>

            {confirmLastUrl === loc.url && (
              <div className="space-y-2 rounded border border-destructive/40 bg-destructive/5 p-2">
                <p className="text-xs">
                  This is the object's <strong>last</strong> location. Remove the bytes from the backend and…
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="destructive" size="sm" disabled={busy} onClick={() => void removeFromBackend(loc.url, false)}>
                    Also remove index entry
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void removeFromBackend(loc.url, true)}>
                    Keep index entry (no bytes)
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmLastUrl(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {transferMode && createPortal(
        <div className="fixed inset-0 z-picker flex items-center justify-center bg-scrim p-4 max-md:p-2">
          <BackendActionCard
            workspaceId={workspaceId}
            documentCount={1}
            initialMode={transferMode}
            defaultFilename={filename}
            saving={transferSaving}
            onConfirm={transfer}
            onClose={() => { if (!transferSaving) setTransferMode(null) }}
          />
        </div>,
        window.document.body,
      )}
    </div>
  )
}
