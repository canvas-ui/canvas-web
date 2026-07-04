import { Document, TreeNode } from '@/types/workspace'
import { File, Calendar, Hash, Eye, ExternalLink, Globe, Mail, X, Trash2, Copy, Move, Clipboard, CheckSquare, Square, Download, Upload, Search, Save, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Scissors, Link, Link2, Pencil, PanelRight, FileSearch } from 'lucide-react'
import { LinkToCard } from '@/components/menu/shared/LinkToCard'
import { PickDocumentsCard } from '@/components/menu/shared/PickDocumentsCard'
import { useSideView } from '@/components/shell/side-view-context'
import { useState, useCallback, useMemo, useEffect } from 'react'
import Fuse from 'fuse.js'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SortableTableHead,
  useSortableData,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { createPortal } from 'react-dom'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { FilePreview, isPreviewable } from '@/components/common/file-preview'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LazyMarkdownEditor, LazyNoteViewer } from '@/components/common/lazy-editor'
import { TagInput } from '@/components/toolbox/add/TagInput'
import { tagsToFeatures } from '@/components/toolbox/add/tags'
import { updateWorkspaceDocument } from '@/services/workspace'
import { useToastHelpers } from '@/hooks/useToastHelpers'

interface DocumentListProps {
  documents: Document[]
  isLoading: boolean
  contextPath: string
  treeName?: string
  workspaceId?: string
  totalCount: number
  onRemoveDocument?: (documentId: number) => void
  onDeleteDocument?: (documentId: number) => void
  onDestroyDocument?: (documentId: number) => void
  onRemoveDocuments?: (documentIds: number[]) => void
  onDeleteDocuments?: (documentIds: number[]) => void
  onDestroyDocuments?: (documentIds: number[]) => void
  onCopyDocuments?: (documentIds: number[]) => void
  onCutDocuments?: (documentIds: number[]) => void
  onPasteDocuments?: (path: string, documentIds: number[], options?: DocumentPasteOptions) => Promise<boolean>
  onImportDocuments?: (documents: any[], contextPath: string) => Promise<boolean>
  onSelectionChange?: (documentIds: number[]) => void
  pastedDocumentIds?: number[]
  viewMode?: 'card' | 'table'
  activeContextUrl?: string
  currentContextUrl?: string
  // Pagination props
  currentPage?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  onPurgeDocuments?: () => void
  disablePurgeDocuments?: boolean
  backendSearchQueries?: string[]
  onBackendSearch?: (query: string) => void
  onRemoveBackendQuery?: (index: number) => void
  // Document scope: 'path' lists the selected tree path; 'workspace' lists every doc.
  scope?: 'path' | 'workspace'
  onScopeChange?: (scope: 'path' | 'workspace') => void
  canSaveChanges?: boolean
  isSavingChanges?: boolean
  onSaveChanges?: () => Promise<void> | void
  // When provided, enables "Link to…" — links selected documents to chosen tree
  // paths (via onPasteDocuments with move:false). Hidden when absent.
  linkTree?: TreeNode | null
}

export interface DocumentPasteOptions {
  move?: boolean
  sourcePath?: string
  sourceTreeName?: string
}

interface DocumentRowProps {
  document: Document
  isSelected?: boolean
  workspaceId?: string
  onSelect?: (documentId: number, isSelected: boolean, isCtrlClick: boolean) => void
  onRemoveDocument?: (documentId: number) => void
  onDeleteDocument?: (documentId: number) => void
  onLinkDocument?: (documentId: number) => void
  onOpenToSide?: (document: Document) => void
  onRightClick?: (event: React.MouseEvent, documentId: number) => void
  onDragStart?: (event: React.DragEvent, documentId: number) => void
}

interface DocumentTableRowProps {
  document: Document
  isSelected?: boolean
  workspaceId?: string
  onSelect?: (documentId: number, isSelected: boolean, isCtrlClick: boolean) => void
  onRemoveDocument?: (documentId: number) => void
  onDeleteDocument?: (documentId: number) => void
  onLinkDocument?: (documentId: number) => void
  onOpenToSide?: (document: Document) => void
  onRightClick?: (event: React.MouseEvent, documentId: number) => void
  onDragStart?: (event: React.DragEvent, documentId: number) => void
}

interface DocumentDetailModalProps {
  document: Document | null
  isOpen: boolean
  onClose: () => void
  workspaceId?: string
  initialTab?: DetailTab
}

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  documents: Document[]
  selectedDocuments: Set<number>
}

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (documents: any[]) => Promise<boolean>
}

function ExportModal({ isOpen, onClose, documents, selectedDocuments }: ExportModalProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  if (!isOpen) return null

  const handleClose = () => {
    setCopyStatus('idle')
    onClose()
  }

  const documentsToExport = selectedDocuments.size > 0
    ? documents.filter(doc => selectedDocuments.has(doc.id))
    : documents

  const exportData = documentsToExport.map(doc => ({
    schema: doc.schema,
    schemaVersion: doc.schemaVersion,
    data: doc.data,
    metadata: doc.metadata
  }))

  const jsonString = JSON.stringify(exportData, null, 2)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(jsonString)
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
      setCopyStatus('error')
      setTimeout(() => setCopyStatus('idle'), 2000)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'a') {
        e.preventDefault()
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(e.currentTarget)
        selection?.removeAllRanges()
        selection?.addRange(range)
      } else if (e.key === 'c') {
        copyToClipboard()
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">Export Documents</h2>
              <p className="text-muted-foreground">
                Exporting {documentsToExport.length} document{documentsToExport.length !== 1 ? 's' : ''}
                {copyStatus === 'copied' && <span className="text-green-600 ml-2">✓ Copied to clipboard!</span>}
                {copyStatus === 'error' && <span className="text-red-600 ml-2">✗ Failed to copy</span>}
              </p>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-muted rounded-sm" title="Close">✕</button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">JSON Data (Press Ctrl+A to select all, Ctrl+C to copy)</h3>
                <Button onClick={copyToClipboard} size="sm" className="flex items-center gap-2">
                  <Copy className="h-4 w-4" />
                  Copy to Clipboard
                </Button>
              </div>
            <textarea
              className="w-full h-96 p-4 bg-muted border rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              value={jsonString}
              readOnly
              autoFocus
              onKeyDown={handleKeyDown}
              onFocus={(e) => e.target.select()}
            />
            </div>
          </div>

          <div className="mt-8 pt-4 border-t flex justify-end">
            <Button onClick={handleClose}>Close</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
  const [jsonInput, setJsonInput] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const validateAndImport = async () => {
    setError(null)
    if (!jsonInput.trim()) {
      setError('Please enter JSON data')
      return
    }

    try {
      const parsed = JSON.parse(jsonInput)
      const documents = Array.isArray(parsed) ? parsed : [parsed]

      // Validate document structure
      for (const doc of documents) {
        if (!doc.schema || !doc.data) {
          setError('Each document must have "schema" and "data" fields')
          return
        }
      }

      setIsImporting(true)
      const success = await onImport(documents)
      if (success) {
        setJsonInput('')
        onClose()
      } else {
        setError('Failed to import documents')
      }
    } catch (err) {
      setError('Invalid JSON format')
    } finally {
      setIsImporting(false)
    }
  }

  const handleClose = () => {
    setJsonInput('')
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">Import Documents</h2>
              <p className="text-muted-foreground">
                Paste JSON data containing documents to import
              </p>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-muted rounded-sm" title="Close">✕</button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                JSON Data (single document or array of documents)
              </label>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                className="w-full h-64 p-3 border rounded-lg font-mono text-sm"
                placeholder='[{"schema": "data/abstraction/tab", "schemaVersion": "2.0", "data": {...}, "metadata": {...}}]'
                disabled={isImporting}
                autoFocus
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg border">
                {error}
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              <p><strong>Format:</strong> Each document must have "schema", "schemaVersion", "data", and "metadata" fields.</p>
              <p><strong>Example schemas:</strong> "data/abstraction/tab", "data/abstraction/file", etc.</p>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t flex justify-between">
            <Button variant="outline" onClick={handleClose} disabled={isImporting}>
              Cancel
            </Button>
            <Button onClick={validateAndImport} disabled={isImporting || !jsonInput.trim()}>
              {isImporting ? 'Importing...' : 'Import Documents'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

const NOTE_SCHEMA = 'data/abstraction/note'
const LINK_SCHEMA = 'data/abstraction/link'
const TAB_SCHEMA = 'data/abstraction/tab'

function isEditableSchema(schema: string): boolean {
  return schema === NOTE_SCHEMA || schema === LINK_SCHEMA || schema === TAB_SCHEMA
}

function featuresToTags(features: string[] | undefined): string[] {
  return (features || []).filter(f => f.startsWith('tag/')).map(f => f.slice(4))
}

// Per-schema field mapping for the url/title pair. Legacy links store these as
// uri/label; tabs use url/title. Notes have no url.
function urlTitleKeys(schema: string): { urlKey: string | null; titleKey: string } {
  if (schema === LINK_SCHEMA) return { urlKey: 'uri', titleKey: 'label' }
  if (schema === TAB_SCHEMA) return { urlKey: 'url', titleKey: 'title' }
  return { urlKey: null, titleKey: 'title' }
}

// Inline edit form rendered as the "Edit" tab inside the document detail modal.
// Editing a link/tab url upserts the document (checksum recalculated) — accepted.
function DocumentEditForm({ document: doc, workspaceId, onClose }: { document: Document; workspaceId?: string; onClose: () => void }) {
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const isNote = doc.schema === NOTE_SCHEMA
  const { urlKey, titleKey } = urlTitleKeys(doc.schema)

  const [url, setUrl] = useState<string>(urlKey ? String(doc.data?.[urlKey] ?? '') : '')
  const [title, setTitle] = useState<string>(String(doc.data?.[titleKey] ?? ''))
  const [content, setContent] = useState<string>(String(doc.data?.content ?? ''))
  const [tags, setTags] = useState<string[]>(
    featuresToTags((doc.metadata as any)?.features).length
      ? featuresToTags((doc.metadata as any)?.features)
      : ((doc.data?.tags as string[] | undefined) ?? [])
  )
  const [saving, setSaving] = useState(false)

  const urlValid = !urlKey || (() => { try { new URL(url.trim()); return true } catch { return false } })()
  const canSave = !saving && (isNote ? content.trim().length > 0 : urlValid)

  const handleSave = async () => {
    if (!workspaceId) { showErrorToast('Missing workspace'); return }
    setSaving(true)
    try {
      const cleanTags = tags.map(t => t.trim()).filter(Boolean)
      let data: Record<string, any>
      if (isNote) {
        data = { ...(title.trim() ? { title: title.trim() } : {}), content }
      } else {
        data = { ...doc.data }
        if (urlKey) data[urlKey] = url.trim()
        if (title.trim()) data[titleKey] = title.trim(); else delete data[titleKey]
        data.tags = cleanTags
      }
      await updateWorkspaceDocument(workspaceId, {
        id: doc.id,
        schema: doc.schema,
        schemaVersion: doc.schemaVersion,
        data,
        metadata: { features: tagsToFeatures(tags) },
      })
      showSuccessToast('Document updated')
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
      onClose()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to update document')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {urlKey && (
        <div className="space-y-1.5">
          <Label htmlFor="edit-url">URL</Label>
          <Input id="edit-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className="font-mono text-xs" />
          {url.trim() && !urlValid && (<p className="text-xs text-destructive">Enter a valid URL, e.g. https://example.com</p>)}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="edit-title">Title</Label>
        <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isNote ? "Optional — defaults to today's date" : 'Optional display title'} />
      </div>

      {isNote && (
        <div className="space-y-1.5">
          <Label>Body</Label>
          <LazyMarkdownEditor value={content} onChange={setContent} placeholder="Write your note…" />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput tags={tags} onChange={setTags} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </div>
  )
}

type DetailTab = 'content' | 'details' | 'json' | 'edit'

function DocumentDetailModal({ document, isOpen, onClose, workspaceId, initialTab }: DocumentDetailModalProps) {
  const isNote = document?.schema === 'data/abstraction/note'
  const editable = !!document && isEditableSchema(document.schema)
  const defaultTab: DetailTab = initialTab ?? (isNote ? 'content' : 'details')
  const [activeTab, setActiveTab] = useState<DetailTab>(defaultTab)

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab ?? (isNote ? 'content' : 'details'))
  }, [isOpen, isNote, initialTab])

  if (!isOpen || !document) return null

  const showPreview = workspaceId && isPreviewable(document)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  const tabs: { id: DetailTab; label: string }[] = [
    ...(isNote ? [{ id: 'content' as DetailTab, label: 'Note' }] : []),
    ...(editable ? [{ id: 'edit' as DetailTab, label: 'Edit' }] : []),
    { id: 'details', label: 'Details' },
    { id: 'json', label: 'JSON' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 pb-0 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">Document Details</h2>
              <p className="text-muted-foreground">ID: {document.id}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-sm" title="Close">✕</button>
          </div>

          <div className="flex gap-1 border-b">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6 pt-4">
          {activeTab === 'content' && isNote && (
            <div className="space-y-4">
              {document.data?.title && (
                <h3 className="text-lg font-semibold">{document.data.title}</h3>
              )}
              <div className="rounded-md border border-input bg-transparent">
                <LazyNoteViewer content={document.data?.content ?? ''} />
              </div>
            </div>
          )}

          {activeTab === 'edit' && editable && (
            <DocumentEditForm document={document} workspaceId={workspaceId} onClose={onClose} />
          )}

          {activeTab === 'details' && (
            <div className="space-y-6">
              {showPreview && workspaceId && (
                <div>
                  <h3 className="font-semibold mb-3">Preview</h3>
                  <FilePreview workspaceId={workspaceId} document={document} />
                </div>
              )}
              <div>
                <h3 className="font-semibold mb-3">Basic Information</h3>
                <div className="grid gap-3 text-sm">
                  <div><span className="font-medium">Schema:</span><span className="ml-2 font-mono">{document.schema}</span></div>
                  <div><span className="font-medium">Schema Version:</span><span className="ml-2">{document.schemaVersion}</span></div>
                  <div><span className="font-medium">Version:</span><span className="ml-2">{document.versionNumber} / {document.latestVersion}</span></div>
                  <div><span className="font-medium">Created:</span><span className="ml-2">{formatDate(document.createdAt)}</span></div>
                  <div><span className="font-medium">Updated:</span><span className="ml-2">{formatDate(document.updatedAt)}</span></div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Document Data</h3>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">{JSON.stringify(document.data, null, 2)}</pre>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Metadata</h3>
                <div className="grid gap-3 text-sm">
                  <div><span className="font-medium">Content Type:</span><span className="ml-2">{document.metadata?.contentType ?? '—'}</span></div>
                  <div><span className="font-medium">Content Encoding:</span><span className="ml-2">{document.metadata?.contentEncoding ?? '—'}</span></div>
                  {(() => {
                    const raw = (document as any).locations ?? []
                    if (!Array.isArray(raw) || raw.length === 0) return null
                    const items: string[] = raw.map((l: any) => typeof l === 'string' ? l : (l?.url ?? '')).filter(Boolean)
                    if (items.length === 0) return null
                    return (
                      <div>
                        <span className="font-medium">Locations:</span>
                        <div className="ml-2 mt-1">
                          {items.map((path, index) => (<div key={index} className="font-mono text-xs break-all">{path}</div>))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {Array.isArray(document.checksumArray) && document.checksumArray.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Checksums</h3>
                  <div className="space-y-2">
                    {document.checksumArray.map((checksum, index) => {
                      const [algo, hash] = checksum.split('/')
                      return (
                        <div key={index} className="flex items-center gap-2 text-sm font-mono">
                          <span className="font-medium">{algo}:</span>
                          <span className="text-muted-foreground">{hash}</span>
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
                    <div><span className="font-medium">Primary Checksum Algorithm:</span><span className="ml-2">{document.indexOptions.primaryChecksumAlgorithm ?? '—'}</span></div>
                    <div>
                      <span className="font-medium">FTS Search Fields:</span>
                      <div className="ml-2 mt-1">{(document.indexOptions.ftsSearchFields ?? []).map((field, index) => (<span key={index} className="inline-block bg-muted px-2 py-1 rounded text-xs mr-2 mb-1">{field}</span>))}</div>
                    </div>
                    <div>
                      <span className="font-medium">Vector Embedding Fields:</span>
                      <div className="ml-2 mt-1">{(document.indexOptions.vectorEmbeddingFields ?? []).map((field, index) => (<span key={index} className="inline-block bg-muted px-2 py-1 rounded text-xs mr-2 mb-1">{field}</span>))}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'json' && (
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">{JSON.stringify(document, null, 2)}</pre>
          )}
        </div>

        <div className="shrink-0 px-6 py-4 border-t flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

function DocumentTableRow({ document, isSelected, workspaceId, onSelect, onRemoveDocument, onDeleteDocument, onLinkDocument, onOpenToSide, onRightClick, onDragStart }: DocumentTableRowProps) {
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab | undefined>(undefined)
  const isEditable = isEditableSchema(document.schema)

  const isTabDocument = document.schema === 'data/abstraction/tab'
  const tabUrl = isTabDocument ? document.data.url : null
  const display = getDocumentDisplayInfo(document)

  const handleDragStart = (e: React.DragEvent) => {
    onDragStart?.(e, document.id);
  }

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const getPrimaryChecksum = () => {
    if (document.checksumArray && document.checksumArray.length > 0) {
      const primary = document.checksumArray.find(c => c.startsWith(document.indexOptions?.primaryChecksumAlgorithm || 'sha1'))
      if (primary) { const [algo, hash] = primary.split('/'); if (hash) return { algo, hash: hash.substring(0, 8) + '...' } }
    }
    return null
  }

  const primaryChecksum = getPrimaryChecksum()

  const handleDocumentClick = (e: React.MouseEvent) => {
    const isCtrlClick = e.ctrlKey || e.metaKey
    if (onSelect) {
      if (isCtrlClick) {
        // For ctrl+click, toggle selection state
        onSelect(document.id, !isSelected, isCtrlClick)
      } else {
        // For regular click, always select this document (and clear others)
        onSelect(document.id, true, isCtrlClick)
      }
    }
    if (!isCtrlClick) {
      if (isTabDocument && tabUrl) {
        window.open(tabUrl, '_blank', 'noopener,noreferrer')
      } else {
        setShowDetailModal(true)
      }
    }
  }

  const handleMouseDown = () => {
    // Removed auto-selection logic to avoid race conditions with drag operations
    // Drag will work based on current selection state, click will handle selection
  }

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation() // Prevent bubbling to empty area handler
    if (onSelect && !isSelected) { onSelect(document.id, true, false) }
    onRightClick?.(e, document.id)
  }

  const handleViewDetails = (e: React.MouseEvent) => { e.stopPropagation(); setDetailTab(undefined); setShowDetailModal(true) }
  const handleEditDocument = (e: React.MouseEvent) => { e.stopPropagation(); setDetailTab('edit'); setShowDetailModal(true) }
  const handleRemoveDocument = (e: React.MouseEvent) => { e.stopPropagation(); onRemoveDocument?.(document.id) }
  const handleDeleteDocument = (e: React.MouseEvent) => { e.stopPropagation(); onDeleteDocument?.(document.id) }

  return (
    <>
      <TableRow
        className={`cursor-pointer ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-muted/50'}`}
        onClick={handleDocumentClick}
        onMouseDown={handleMouseDown}
        onContextMenu={handleRightClick}
        draggable
        onDragStart={handleDragStart}
      >
        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-blue-600 align-middle"
            checked={!!isSelected}
            onChange={(e) => onSelect?.(document.id, e.target.checked, true)}
          />
        </TableCell>
        <TableCell className="w-12">
          {display.icon === 'globe' ? <Globe className="h-4 w-4 text-blue-500" /> : display.icon === 'mail' ? <Mail className="h-4 w-4 text-blue-500" /> : <File className="h-4 w-4 text-blue-500" />}
        </TableCell>
        <TableCell className="font-medium max-w-xs">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate" title={display.title}>{display.title}</span>
              {display.isExternal && (<ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />)}
            </div>
            {display.subtitle && (
              <div className="truncate text-xs text-muted-foreground" title={display.subtitle}>{display.subtitle}</div>
            )}
          </div>
        </TableCell>
        <TableCell><span className="px-2 py-1 text-xs bg-muted rounded border">{display.schemaLabel}</span></TableCell>
        <TableCell className="text-xs text-muted-foreground">{document.id}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{primaryChecksum && (<span className="font-mono" title={`${primaryChecksum.algo} checksum`}>{primaryChecksum.hash}</span>)}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{formatDate(document.createdAt)}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{document.versionNumber > 1 ? `v${document.versionNumber}` : ''}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleViewDetails} title="View document details"><Eye className="h-4 w-4" /></Button>
            {isEditable && (<Button variant="ghost" size="sm" onClick={handleEditDocument} title="Edit document"><Pencil className="h-4 w-4" /></Button>)}
            {onLinkDocument && (<Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onLinkDocument(document.id) }} title="Link document to other paths"><Link2 className="h-4 w-4" /></Button>)}
            {onOpenToSide && (<Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onOpenToSide(document) }} title="Open to the side"><PanelRight className="h-4 w-4" /></Button>)}
            {onRemoveDocument && (<Button variant="ghost" size="sm" onClick={handleRemoveDocument} title="Remove document from context"><X className="h-4 w-4" /></Button>)}
            {onDeleteDocument && (<Button variant="ghost" size="sm" onClick={handleDeleteDocument} title="Delete document permanently" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>)}
          </div>
        </TableCell>
      </TableRow>
      <DocumentDetailModal document={document} isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} workspaceId={workspaceId} initialTab={detailTab} />
    </>
  )
}

function DocumentRow({ document, isSelected, workspaceId, onSelect, onRemoveDocument, onDeleteDocument, onLinkDocument, onOpenToSide, onRightClick, onDragStart }: DocumentRowProps) {
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab | undefined>(undefined)
  const isTabDocument = document.schema === 'data/abstraction/tab'
  const isEditable = isEditableSchema(document.schema)
  const tabUrl = isTabDocument ? document.data.url : null
  const display = getDocumentDisplayInfo(document)

  const handleDragStart = (e: React.DragEvent) => {
    onDragStart?.(e, document.id);
  }

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const getPrimaryChecksum = () => { if (document.checksumArray && document.checksumArray.length > 0) { const primary = document.checksumArray.find(c => c.startsWith(document.indexOptions?.primaryChecksumAlgorithm || 'sha1')); if (primary) { const [algo, hash] = primary.split('/'); if (hash) return { algo, hash: hash.substring(0, 8) + '...' } } } return null }

  const primaryChecksum = getPrimaryChecksum()

  const handleDocumentClick = (e: React.MouseEvent) => {
    const isCtrlClick = e.ctrlKey || e.metaKey
    if (onSelect) {
      if (isCtrlClick) {
        // For ctrl+click, toggle selection state
        onSelect(document.id, !isSelected, isCtrlClick)
      } else {
        // For regular click, always select this document (and clear others)
        onSelect(document.id, true, isCtrlClick)
      }
    }
    if (!isCtrlClick) { if (isTabDocument && tabUrl) { window.open(tabUrl, '_blank', 'noopener,noreferrer') } else { setShowDetailModal(true) } }
  }

  const handleMouseDown = () => {
    // Removed auto-selection logic to avoid race conditions with drag operations
    // Drag will work based on current selection state, click will handle selection
  }

  const handleRightClick = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); if (onSelect && !isSelected) { onSelect(document.id, true, false) } onRightClick?.(e, document.id) }
  const handleViewDetails = (e: React.MouseEvent) => { e.stopPropagation(); setDetailTab(undefined); setShowDetailModal(true) }
  const handleEditDocument = (e: React.MouseEvent) => { e.stopPropagation(); setDetailTab('edit'); setShowDetailModal(true) }
  const handleRemoveDocument = (e: React.MouseEvent) => { e.stopPropagation(); onRemoveDocument?.(document.id) }
  const handleDeleteDocument = (e: React.MouseEvent) => { e.stopPropagation(); onDeleteDocument?.(document.id) }

  return (
    <>
      <div
        className={`border rounded-lg p-4 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200' : ''} ${isTabDocument && !isSelected ? 'hover:bg-blue-50 hover:border-blue-200' : !isSelected ? 'hover:bg-accent/50' : ''}`}
        onClick={handleDocumentClick}
        onMouseDown={handleMouseDown}
        onContextMenu={handleRightClick}
        draggable
        onDragStart={handleDragStart}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 overflow-hidden">
              {display.icon === 'globe' ? (<Globe className="h-4 w-4 text-blue-500 flex-shrink-0" />) : display.icon === 'mail' ? (<Mail className="h-4 w-4 text-blue-500 flex-shrink-0" />) : (<File className="h-4 w-4 text-blue-500 flex-shrink-0" />)}
              <h4 className="font-medium truncate min-w-0 flex-1 max-w-[640px]" title={display.title}>{display.title}</h4>
              {display.isExternal && (<ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />)}
              <span className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded border flex-shrink-0">{display.schemaLabel}</span>
            </div>

            {display.subtitle && (<p className="text-xs text-muted-foreground mb-2 truncate" title={display.subtitle}>{display.subtitle}</p>)}

            {display.preview && (<p className="text-sm text-muted-foreground mb-3 line-clamp-2 break-all overflow-hidden">{display.preview}</p>)}

            <div className="flex items-center gap-4 text-xs text-muted-foreground overflow-hidden">
              <div className="flex items-center gap-1 flex-shrink-0"><span className="font-medium">ID:</span><span className="font-mono truncate max-w-[60px]" title={`ID: ${document.id}`}>{document.id}</span></div>
              {primaryChecksum && (<div className="flex items-center gap-1 flex-shrink-0"><Hash className="h-3 w-3" /><span className="font-mono" title={`${primaryChecksum.algo} checksum`}>{primaryChecksum.hash}</span></div>)}
              <div className="flex items-center gap-1 flex-shrink-0"><Calendar className="h-3 w-3" /><span title={`Created: ${formatDate(document.createdAt)}`}>{formatDate(document.createdAt)}</span></div>
              {document.versionNumber > 1 && (<div className="flex items-center gap-1 flex-shrink-0"><span className="font-medium">v{document.versionNumber}</span></div>)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleViewDetails} className="p-1 hover:bg-muted rounded-sm" title="View document details"><Eye className="h-4 w-4" /></button>
            {isEditable && (<button onClick={handleEditDocument} className="p-1 hover:bg-muted rounded-sm" title="Edit document"><Pencil className="h-4 w-4" /></button>)}
            {onLinkDocument && (<button onClick={(e) => { e.stopPropagation(); onLinkDocument(document.id) }} className="p-1 hover:bg-muted rounded-sm" title="Link document to other paths"><Link2 className="h-4 w-4" /></button>)}
            {onOpenToSide && (<button onClick={(e) => { e.stopPropagation(); onOpenToSide(document) }} className="p-1 hover:bg-muted rounded-sm" title="Open to the side"><PanelRight className="h-4 w-4" /></button>)}
            {onRemoveDocument && (<button onClick={handleRemoveDocument} className="p-1 hover:bg-muted rounded-sm" title="Remove document from context (keep in database)"><X className="h-4 w-4" /></button>)}
            {onDeleteDocument && (<button onClick={handleDeleteDocument} className="p-1 hover:bg-destructive hover:text-destructive-foreground rounded-sm text-destructive" title="Delete document permanently from database"><Trash2 className="h-4 w-4" /></button>)}
          </div>
        </div>
      </div>
      <DocumentDetailModal document={document} isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} workspaceId={workspaceId} initialTab={detailTab} />
    </>
  )
}

export function DocumentList({ documents, isLoading, contextPath, treeName, workspaceId, totalCount, onRemoveDocument, onDeleteDocument, onDestroyDocument, onRemoveDocuments, onDeleteDocuments, onDestroyDocuments, onCopyDocuments, onCutDocuments, onPasteDocuments, onImportDocuments, onSelectionChange, pastedDocumentIds, viewMode = 'card', activeContextUrl, currentContextUrl, currentPage = 1, pageSize = 50, onPageChange, onPageSizeChange, onPurgeDocuments, disablePurgeDocuments = false, backendSearchQueries = [], onBackendSearch, onRemoveBackendQuery, scope = 'path', onScopeChange, canSaveChanges = false, isSavingChanges = false, onSaveChanges, linkTree }: DocumentListProps) {
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; documentIds: number[] } | null>(null)
  const [linkPanelIds, setLinkPanelIds] = useState<number[] | null>(null)
  const [pickDocsOpen, setPickDocsOpen] = useState(false)
  const [detailModal, setDetailModal] = useState<{ document: Document; tab?: DetailTab } | null>(null)
  const canLink = Boolean(linkTree && onPasteDocuments)
  const sideView = useSideView()
  const openToSide = workspaceId ? (doc: Document) => sideView.open(doc, workspaceId) : undefined
  // "Remove from folder" is path-scoped: in whole-workspace scope the listed docs
  // may not live in selectedPath, so removing there is a silent no-op. Suppress it.
  const isWorkspaceScope = scope === 'workspace'
  const removeDocument = isWorkspaceScope ? undefined : onRemoveDocument
  const removeDocuments = isWorkspaceScope ? undefined : onRemoveDocuments

  const [emptyAreaContextMenu, setEmptyAreaContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  // The input is a buffer for the NEXT query to add to the stack (not a mirror of
  // a single active query) — submitting appends a chip and clears it. It also
  // drives the local fuse filter over the loaded page while you type.
  const [searchQuery, setSearchQuery] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const hasServerSearch = backendSearchQueries.length > 0

  // Clear selection when context path changes
  useEffect(() => {
    setSelectedDocuments(new Set())
  }, [contextPath])

  // Expose selection to parent (for cross-pane F5/F6 transfers)
  useEffect(() => {
    onSelectionChange?.(Array.from(selectedDocuments))
  }, [selectedDocuments, onSelectionChange])

  const submitBackendSearch = useCallback(() => {
    if (!onBackendSearch) return
    const q = searchQuery.trim()
    if (!q) return
    onBackendSearch(q)   // parent appends to the stack
    setSearchQuery('')   // clear buffer for the next refinement
  }, [onBackendSearch, searchQuery])

  const clearAllSearch = useCallback(() => {
    setSearchQuery('')
    if (onRemoveBackendQuery && backendSearchQueries.length > 0) onRemoveBackendQuery(-1) // clear all
  }, [onRemoveBackendQuery, backendSearchQueries.length])
      // Handle drag start for selected documents
  const handleMultiDragStart = useCallback((e: React.DragEvent, documentId: number) => {
    // Always ensure the dragged document is included
    let draggedIds: number[];

    if (selectedDocuments.has(documentId) && selectedDocuments.size > 1) {
      // Document is part of a multi-selection, drag all selected documents
      draggedIds = Array.from(selectedDocuments);
    } else {
      // Single document drag - either it's the only selected one or not selected at all
      draggedIds = [documentId];
      // Update selection to show this document is being dragged
      setSelectedDocuments(new Set([documentId]));
    }

    const dragData = {
      type: 'document',
      documentIds: draggedIds,
      sourcePath: contextPath,
      sourceTreeName: treeName,
    };

    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'copyMove';

    // Add visual feedback for dragging
    e.dataTransfer.setDragImage(e.currentTarget as Element, 0, 0);
  }, [selectedDocuments, contextPath, treeName])

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    if (!onPasteDocuments) return
    const raw = event.dataTransfer.getData('application/json')
    if (!raw) return
    let dragData: { type?: string; documentIds?: number[]; sourcePath?: string; sourceTreeName?: string } | null = null
    try { dragData = JSON.parse(raw) } catch { return }
    if (dragData?.type !== 'document' || !Array.isArray(dragData.documentIds) || dragData.documentIds.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
    await onPasteDocuments(contextPath, dragData.documentIds, {
      move: event.shiftKey,
      sourcePath: dragData.sourcePath,
      sourceTreeName: dragData.sourceTreeName,
    })
    setSelectedDocuments(new Set())
  }, [contextPath, onPasteDocuments])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!onPasteDocuments) return
    if (!Array.from(event.dataTransfer.types).includes('application/json')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = event.shiftKey ? 'move' : 'copy'
    setIsDragOver(true)
  }, [onPasteDocuments])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    if (!(event.currentTarget as Node).contains(event.relatedTarget as Node)) setIsDragOver(false)
  }, [])

  // Fuse.js configuration for fuzzy search
  const fuseOptions = useMemo(() => ({
    keys: [
      { name: 'data.title', weight: 0.4 },
      { name: 'data.name', weight: 0.4 },
      { name: 'locations.url', weight: 0.4 },
      { name: 'data.url', weight: 0.3 },
      { name: 'data.content', weight: 0.2 },
      { name: 'data.description', weight: 0.2 },
      { name: 'schema', weight: 0.1 }
    ],
    threshold: 0.4,
    location: 0,
    distance: 100,
    minMatchCharLength: 1,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true
  }), [])

  // Create Fuse instance
  const fuse = useMemo(() => {
    if (documents.length === 0) return null
    return new Fuse(documents, fuseOptions)
  }, [documents, fuseOptions])

  // Filter documents based on search query
  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents
    if (!fuse) return documents

    const searchResults = fuse.search(searchQuery)
    return searchResults.map(result => result.item)
  }, [documents, searchQuery, fuse])

  // Column sort for the table view
  const sortAccessors = useMemo(() => ({
    title: (d: Document) => getDocumentDisplayInfo(d).title?.toLowerCase() ?? '',
    schema: (d: Document) => getDocumentDisplayInfo(d).schemaLabel ?? '',
    id: (d: Document) => d.id,
    created: (d: Document) => Date.parse(d.createdAt) || 0,
    version: (d: Document) => d.versionNumber ?? 0,
  }), [])
  const { sorted: sortedDocuments, sort, toggleSort } = useSortableData(filteredDocuments, sortAccessors)

  const handleDocumentSelect = useCallback((documentId: number, isSelected: boolean, isCtrlClick: boolean) => {
    setSelectedDocuments(prev => {
      const newSelection = new Set(prev)
      if (isCtrlClick) {
        if (isSelected) { newSelection.add(documentId) } else { newSelection.delete(documentId) }
      } else {
        newSelection.clear(); if (isSelected) { newSelection.add(documentId) }
      }
      return newSelection
    })
  }, [])

  const handleDocumentRightClick = useCallback((event: React.MouseEvent, documentId: number) => {
    event.preventDefault()
    event.stopPropagation() // Prevent bubbling to empty area handler
    let targetIds: number[]
    if (selectedDocuments.has(documentId)) { targetIds = Array.from(selectedDocuments) } else { targetIds = [documentId]; setSelectedDocuments(new Set([documentId])) }
    setContextMenu({ x: event.clientX, y: event.clientY, documentIds: targetIds })
  }, [selectedDocuments])

  const handleLinkConfirm = useCallback(async (paths: string[], documentIds: number[]) => {
    if (!onPasteDocuments) return
    for (const path of paths) {
      await onPasteDocuments(path, documentIds, { move: false })
    }
    setSelectedDocuments(new Set())
  }, [onPasteDocuments])

  const handleContextMenuAction = useCallback(async (action: string, documentIds: number[]) => {
    switch (action) {
      case 'edit':
        if (documentIds.length === 1) {
          const doc = documents.find(d => d.id === documentIds[0])
          if (doc) { setDetailModal({ document: doc, tab: 'edit' }); setContextMenu(null); return }
        }
        break
      case 'copy': onCopyDocuments?.(documentIds); break
      case 'cut': onCutDocuments?.(documentIds); break
      case 'link-to': setLinkPanelIds(documentIds); setContextMenu(null); return
      case 'remove': documentIds.length === 1 ? onRemoveDocument?.(documentIds[0]) : onRemoveDocuments?.(documentIds); break
      case 'delete': documentIds.length === 1 ? onDeleteDocument?.(documentIds[0]) : onDeleteDocuments?.(documentIds); break
      case 'destroy': documentIds.length === 1 ? onDestroyDocument?.(documentIds[0]) : onDestroyDocuments?.(documentIds); break
      case 'view-details':
        if (documentIds.length === 1) {
          const doc = documents.find(d => d.id === documentIds[0]);
          if (doc) { setDetailModal({ document: doc }); setContextMenu(null); return }
        }
        break;
      case 'open-url':
        if (documentIds.length === 1) {
          const document = documents.find(doc => doc.id === documentIds[0]);
          if (document && document.schema === 'data/abstraction/tab' && document.data.url) {
            window.open(document.data.url, '_blank', 'noopener,noreferrer');
          }
        }
        break;
      case 'copy-id':
        if (documentIds.length === 1) {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(documentIds[0].toString());
            } else {
              // Fallback for environments without clipboard API
              const textArea = document.createElement('textarea');
              textArea.value = documentIds[0].toString();
              document.body.appendChild(textArea);
              textArea.select();
              document.execCommand('copy');
              document.body.removeChild(textArea);
            }
          } catch (err) {
            console.error('Failed to copy ID to clipboard:', err);
            // Fallback method
            const textArea = document.createElement('textarea');
            textArea.value = documentIds[0].toString();
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
          }
        }
        break;
    }
    setContextMenu(null)
    setSelectedDocuments(new Set())
  }, [onCopyDocuments, onCutDocuments, onRemoveDocument, onRemoveDocuments, onDeleteDocument, onDeleteDocuments, onDestroyDocument, onDestroyDocuments, documents, workspaceId])

  const handleEmptyAreaRightClick = useCallback((event: React.MouseEvent) => {
    // Show context menu if there are documents to paste or import functionality is available
    const hasPasteOption = pastedDocumentIds && pastedDocumentIds.length > 0 && onPasteDocuments
    const hasImportOption = onImportDocuments

    if (!hasPasteOption && !hasImportOption) return

    event.preventDefault()
    event.stopPropagation()
    setEmptyAreaContextMenu({ x: event.clientX, y: event.clientY })
  }, [pastedDocumentIds, onPasteDocuments, onImportDocuments])

  const handleEmptyAreaPaste = useCallback(async () => {
    if (!onPasteDocuments || !pastedDocumentIds || pastedDocumentIds.length === 0) return
    try {
      await onPasteDocuments(contextPath, pastedDocumentIds)
    } catch (error) {
      console.error('Failed to paste documents:', error)
    } finally {
      setEmptyAreaContextMenu(null)
    }
  }, [onPasteDocuments, pastedDocumentIds, contextPath])

  const handleSelectAll = useCallback(() => {
    if (selectedDocuments.size === filteredDocuments.length) {
      setSelectedDocuments(new Set())
    } else {
      setSelectedDocuments(new Set(filteredDocuments.map(doc => doc.id)))
    }
  }, [selectedDocuments.size, filteredDocuments])

  const handleImport = useCallback(async (importedDocuments: any[]) => {
    if (!onImportDocuments) return false
    try {
      return await onImportDocuments(importedDocuments, contextPath)
    } catch (error) {
      console.error('Failed to import documents:', error)
      return false
    }
  }, [onImportDocuments, contextPath])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 p-4 rounded-lg transition-colors ${isDragOver ? 'ring-2 ring-inset ring-primary bg-primary/5' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="border-b pb-3 mb-4 flex-shrink-0">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-muted-foreground">Documents</h3>
            <p className="text-xs text-muted-foreground mt-1 break-all">Context: <span className="font-mono">{contextPath}</span>{activeContextUrl && currentContextUrl && activeContextUrl !== currentContextUrl && (<span className="text-orange-600 ml-2">(not yet active)</span>)}</p>
            {selectedDocuments.size > 0 && (<p className="text-xs text-blue-600 mt-1">{selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected</p>)}
          </div>
          <div className="shrink-0 sm:text-right">
            {searchQuery ? (
              <p className="text-sm font-medium">{filteredDocuments.length} of {documents.length} on this page</p>
            ) : (
              <>
                <p className="text-sm font-medium">{totalCount.toLocaleString()} document{totalCount !== 1 ? 's' : ''}</p>
                {totalCount > pageSize && (
                  <p className="text-xs text-muted-foreground">
                    Showing {Math.min((currentPage - 1) * pageSize + 1, totalCount)}–{Math.min(currentPage * pageSize, totalCount)}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Search Input */}
        <div className="mt-3 space-y-2">
          <div className="relative flex items-center gap-2">
            {onScopeChange && (
              <div className="flex shrink-0 rounded-md border border-input overflow-hidden text-xs font-medium">
                <button
                  type="button"
                  onClick={() => onScopeChange('path')}
                  className={`px-2.5 py-2 transition-colors ${scope === 'path' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                  title="List documents in the selected path"
                >
                  This path
                </button>
                <button
                  type="button"
                  onClick={() => onScopeChange('workspace')}
                  className={`px-2.5 py-2 border-l border-input transition-colors flex items-center gap-1 ${scope === 'workspace' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                  title="List every document in the workspace (staging excluded)"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Whole workspace
                </button>
              </div>
            )}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder={onBackendSearch ? (hasServerSearch ? 'Refine: add another query (Enter)…' : 'Search documents (Enter for server search)…') : 'Search documents...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && onBackendSearch) {
                    e.preventDefault()
                    submitBackendSearch()
                  }
                }}
                className="w-full pl-10 pr-9 py-2 border border-input rounded-md bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
              {(searchQuery || hasServerSearch) && (
                <button
                  onClick={clearAllSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {onBackendSearch && searchQuery.trim() && !backendSearchQueries.includes(searchQuery.trim()) && (
              <Button
                size="sm"
                variant="default"
                onClick={submitBackendSearch}
                className="shrink-0"
                title={hasServerSearch ? 'Refine: add this query (AND)' : 'Run full-text search on the server'}
              >
                <Search className="h-3.5 w-3.5 mr-1" />
                {hasServerSearch ? 'Refine' : 'Search server'}
              </Button>
            )}
            {canSaveChanges && onSaveChanges && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSaveChanges}
                disabled={isSavingChanges}
                className="shrink-0"
                title="Save current query and filters"
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                {isSavingChanges ? 'Saving...' : 'Save changes'}
              </Button>
            )}
          </div>
          {hasServerSearch && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Server search:</span>
              {backendSearchQueries.map((q, i) => (
                <span key={`${q}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground/70 font-medium">AND</span>}
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-foreground border">
                    <span className="font-mono">"{q}"</span>
                    {onRemoveBackendQuery && (
                      <button
                        onClick={() => onRemoveBackendQuery(i)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Remove this query"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                </span>
              ))}
              {onRemoveBackendQuery && backendSearchQueries.length > 1 && (
                <button
                  onClick={() => onRemoveBackendQuery(-1)}
                  className="ml-1 text-muted-foreground hover:text-foreground underline"
                  title="Clear all queries"
                >
                  clear all
                </button>
              )}
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {onPageChange && totalCount > pageSize && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Show:</span>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
                className="px-2 py-1 border rounded text-sm"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <span>per page</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Showing {Math.min((currentPage - 1) * pageSize + 1, totalCount)} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(1)}
                  disabled={currentPage === 1}
                  className="p-1"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <span className="px-3 py-1 text-sm font-medium">
                  Page {currentPage} of {Math.ceil(totalCount / pageSize)}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(currentPage + 1)}
                  disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                  className="p-1"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(Math.ceil(totalCount / pageSize))}
                  disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                  className="p-1"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {documents.length > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
            {/* Table view has a header select-all checkbox; card view needs this button. */}
            {viewMode !== 'table' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="flex items-center gap-2"
              disabled={filteredDocuments.length === 0}
            >
              {selectedDocuments.size === filteredDocuments.length ? (
                <>
                  <CheckSquare className="h-4 w-4" />
                  Deselect Page{searchQuery && ` (${filteredDocuments.length})`}
                </>
              ) : (
                <>
                  <Square className="h-4 w-4" />
                  Select Page{searchQuery && ` (${filteredDocuments.length})`}
                </>
              )}
            </Button>
            )}

            {onPurgeDocuments && totalCount > 0 && selectedDocuments.size === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={onPurgeDocuments}
                disabled={disablePurgeDocuments || Boolean(searchQuery)}
                className="flex items-center gap-2 text-destructive hover:text-destructive-foreground hover:bg-destructive"
                title={disablePurgeDocuments || searchQuery ? 'Purge is disabled while local search is active' : 'Delete all documents matching the current server-side filters across all pages'}
              >
                <Trash2 className="h-4 w-4" />
                Purge All ({totalCount})
              </Button>
            )}

            {selectedDocuments.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const selectedIds = Array.from(selectedDocuments)
                    onCopyDocuments?.(selectedIds)
                  }}
                  className="flex items-center gap-2"
                  title="Copy selected documents"
                >
                  <Copy className="h-4 w-4" />
                  Copy ({selectedDocuments.size})
                </Button>

                {canLink && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLinkPanelIds(Array.from(selectedDocuments))}
                    className="flex items-center gap-2"
                    title="Link selected documents to another path"
                  >
                    <Link2 className="h-4 w-4" />
                    Link to… ({selectedDocuments.size})
                  </Button>
                )}

                {onCutDocuments && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const selectedIds = Array.from(selectedDocuments)
                      onCutDocuments(selectedIds)
                    }}
                    className="flex items-center gap-2"
                    title="Cut selected documents"
                  >
                    <Scissors className="h-4 w-4" />
                    Cut ({selectedDocuments.size})
                  </Button>
                )}

                {(onRemoveDocument || onRemoveDocuments) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isWorkspaceScope}
                    onClick={() => {
                      const selectedIds = Array.from(selectedDocuments)
                      if (selectedIds.length === 1) {
                        removeDocument?.(selectedIds[0])
                      } else {
                        removeDocuments?.(selectedIds)
                      }
                      setSelectedDocuments(new Set())
                    }}
                    className="flex items-center gap-2"
                    title={isWorkspaceScope ? 'Switch to “This path” to remove documents from a folder' : 'Remove selected documents from this folder (kept in index)'}
                  >
                    <X className="h-4 w-4" />
                    Remove from folder ({selectedDocuments.size})
                  </Button>
                )}

                {(onDeleteDocument || onDeleteDocuments) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const selectedIds = Array.from(selectedDocuments)
                      if (selectedIds.length === 1) {
                        onDeleteDocument?.(selectedIds[0])
                      } else {
                        onDeleteDocuments?.(selectedIds)
                      }
                      setSelectedDocuments(new Set())
                    }}
                    className="flex items-center gap-2 text-destructive hover:text-destructive-foreground hover:bg-destructive"
                    title="Delete from index (data stays on backends)"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete from index ({selectedDocuments.size})
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowExportModal(true)}
                  className="flex items-center gap-2"
                  title="Export selected documents"
                >
                  <Download className="h-4 w-4" />
                  Export ({selectedDocuments.size})
                </Button>
              </>
            )}

            {pastedDocumentIds && pastedDocumentIds.length > 0 && onPasteDocuments && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPasteDocuments(contextPath, pastedDocumentIds)}
                className="flex items-center gap-2"
                title="Paste documents to current context"
              >
                <Clipboard className="h-4 w-4" />
                Paste ({pastedDocumentIds.length})
              </Button>
            )}

            {selectedDocuments.size === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-2"
                title="Export all documents"
              >
                <Download className="h-4 w-4" />
                Export All
              </Button>
            )}

            {onImportDocuments && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2"
                title="Import documents"
              >
                <Upload className="h-4 w-4" />
                Import
              </Button>
            )}

            {onPasteDocuments && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPickDocsOpen(true)}
                className="flex items-center gap-2"
                title="Browse and add existing documents to this folder"
              >
                <FileSearch className="h-4 w-4" />
                Add existing…
              </Button>
            )}
          </div>
        )}
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="flex-1 flex items-center justify-center" onContextMenu={handleEmptyAreaRightClick}>
          <div className="text-center space-y-2">
            <File className="h-12 w-12 text-muted-foreground/50 mx-auto" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No documents match your search' : 'No documents found in this context'}
            </p>
            <p className="text-xs text-muted-foreground">
              {searchQuery ? (
                <>Search: <span className="font-mono">"{searchQuery}"</span></>
              ) : (
                <>Path: <span className="font-mono">{contextPath}</span></>
              )}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-primary hover:text-primary/80 underline mt-1"
              >
                Clear search
              </button>
            )}
            {!searchQuery && pastedDocumentIds && pastedDocumentIds.length > 0 && (
              <p className="text-xs text-muted-foreground">Right-click to paste {pastedDocumentIds.length} document(s)</p>
            )}
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <div className="flex-1 overflow-y-auto" onContextMenu={handleEmptyAreaRightClick}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-blue-600 align-middle"
                    checked={filteredDocuments.length > 0 && selectedDocuments.size === filteredDocuments.length}
                    ref={(el) => { if (el) el.indeterminate = selectedDocuments.size > 0 && selectedDocuments.size < filteredDocuments.length }}
                    onChange={handleSelectAll}
                    title="Select all on this page"
                  />
                </TableHead>
                <TableHead className="w-12">Type</TableHead>
                <SortableTableHead label="Title" sortKey="title" sort={sort} onSort={toggleSort} />
                <SortableTableHead label="Schema" sortKey="schema" sort={sort} onSort={toggleSort} />
                <SortableTableHead label="ID" sortKey="id" sort={sort} onSort={toggleSort} />
                <TableHead>Checksum</TableHead>
                <SortableTableHead label="Created" sortKey="created" sort={sort} onSort={toggleSort} />
                <SortableTableHead label="Version" sortKey="version" sort={sort} onSort={toggleSort} />
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDocuments.map((document) => (
                <DocumentTableRow key={document.id} document={document} isSelected={selectedDocuments.has(document.id)} workspaceId={workspaceId} onSelect={handleDocumentSelect} onRemoveDocument={removeDocument} onDeleteDocument={onDeleteDocument} onLinkDocument={canLink ? (id) => setLinkPanelIds([id]) : undefined} onOpenToSide={openToSide} onRightClick={handleDocumentRightClick} onDragStart={handleMultiDragStart} />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto" onContextMenu={handleEmptyAreaRightClick}>
          <div className="space-y-3 pr-2">
            {filteredDocuments.map((document) => (
              <div key={document.id} onContextMenu={(e) => { e.stopPropagation(); handleDocumentRightClick(e, document.id); }}>
                <DocumentRow document={document} isSelected={selectedDocuments.has(document.id)} workspaceId={workspaceId} onSelect={handleDocumentSelect} onRemoveDocument={removeDocument} onDeleteDocument={onDeleteDocument} onLinkDocument={canLink ? (id) => setLinkPanelIds([id]) : undefined} onOpenToSide={openToSide} onRightClick={handleDocumentRightClick} onDragStart={handleMultiDragStart} />
              </div>
            ))}
          </div>
        </div>
      )}

      {contextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div className="fixed z-50 bg-background border rounded-lg shadow-lg py-1 min-w-[120px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" onClick={() => handleContextMenuAction('copy', contextMenu.documentIds)}>
              <Copy className="h-3 w-3" />
              Copy {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
            </button>
            {onCutDocuments && (
              <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" onClick={() => handleContextMenuAction('cut', contextMenu.documentIds)}>
                <Scissors className="h-3 w-3" />
                Cut {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
              </button>
            )}
            {canLink && (
              <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" onClick={() => handleContextMenuAction('link-to', contextMenu.documentIds)}>
                <Link2 className="h-3 w-3" />
                Link to… {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
              </button>
            )}
            {contextMenu.documentIds.length === 1 && (
              <>
                <div className="my-1 h-px bg-border" />
                <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" onClick={() => handleContextMenuAction('view-details', contextMenu.documentIds)}>
                  <Eye className="h-3 w-3" />
                  View Details
                </button>
                {(() => {
                  const document = documents.find(doc => doc.id === contextMenu.documentIds[0]);
                  const isEditable = document?.schema === 'data/abstraction/note' || document?.schema === 'data/abstraction/link';
                  return isEditable ? (
                    <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" onClick={() => handleContextMenuAction('edit', contextMenu.documentIds)}>
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  ) : null;
                })()}
                {(() => {
                  const document = documents.find(doc => doc.id === contextMenu.documentIds[0]);
                  const isTabDocument = document?.schema === 'data/abstraction/tab';
                  return isTabDocument && document?.data.url ? (
                    <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" onClick={() => handleContextMenuAction('open-url', contextMenu.documentIds)}>
                      <ExternalLink className="h-3 w-3" />
                      Open URL
                    </button>
                  ) : null;
                })()}
                <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" onClick={() => handleContextMenuAction('copy-id', contextMenu.documentIds)}>
                  <Link className="h-3 w-3" />
                  Copy ID
                </button>
              </>
            )}
            {(removeDocument || removeDocuments) && (
              <>
                <div className="my-1 h-px bg-border" />
                <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" onClick={() => handleContextMenuAction('remove', contextMenu.documentIds)}>
                  <Move className="h-3 w-3" />
                  Remove from folder {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
                </button>
              </>
            )}
            {(onDeleteDocument || onDeleteDocuments) && (
              <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2 text-destructive" onClick={() => handleContextMenuAction('delete', contextMenu.documentIds)}>
                <Trash2 className="h-3 w-3" />
                Delete from index {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
              </button>
            )}
            {(onDestroyDocument || onDestroyDocuments) && (
              <button className="w-full text-left px-3 py-1 hover:bg-destructive hover:text-destructive-foreground text-sm flex items-center gap-2 text-destructive font-medium" onClick={() => handleContextMenuAction('destroy', contextMenu.documentIds)}>
                <Trash2 className="h-3 w-3" />
                Destroy {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
              </button>
            )}
          </div>
        </>, document.body
      )}

      {/* Empty Area Context Menu */}
      {emptyAreaContextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setEmptyAreaContextMenu(null)} />
          <div className="fixed z-50 bg-background border rounded-lg shadow-lg py-1 min-w-[120px]" style={{ left: emptyAreaContextMenu.x, top: emptyAreaContextMenu.y }}>
            {pastedDocumentIds && pastedDocumentIds.length > 0 && (
              <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" onClick={handleEmptyAreaPaste}>
                <Clipboard className="h-3 w-3" />
                Paste Documents ({pastedDocumentIds.length})
              </button>
            )}
            {onImportDocuments && (
              <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" onClick={() => { setEmptyAreaContextMenu(null); setShowImportModal(true) }}>
                <Upload className="h-3 w-3" />
                Import Documents
              </button>
            )}
          </div>
        </>, document.body
      )}

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        documents={documents}
        selectedDocuments={selectedDocuments}
      />

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
      />

      {linkPanelIds && linkTree && (
        // Dimmed modal — was an undimmed bottom-right float, which collided
        // with the bottom-right toolbox FAB and any open B5Card.
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <LinkToCard
            documentCount={linkPanelIds.length}
            fixedWorkspaceName={workspaceId}
            onConfirm={(paths) => handleLinkConfirm(paths, linkPanelIds)}
            onClose={() => setLinkPanelIds(null)}
          />
        </div>
      )}

      {pickDocsOpen && onPasteDocuments && (
        // Flat, no backdrop dim on desktop — docks to the right edge like
        // DocumentSideCard rather than a centered modal. On mobile it becomes
        // an M1/M2-style drawer over a scrim.
        <>
          <div className="fixed inset-0 z-[59] bg-black/30 animate-fade-in md:hidden" onClick={() => setPickDocsOpen(false)} aria-hidden />
          <div className="fixed inset-y-0 right-0 z-[60] flex items-stretch py-2 pr-2 max-md:bottom-2 max-md:left-16 max-md:top-2 max-md:py-0 max-md:pr-0 max-md:animate-fade-in">
            <PickDocumentsCard
              sizeClassName="h-full w-[420px] max-w-full max-md:w-full max-md:shadow-elevation-8"
              fixedWorkspaceName={workspaceId}
              onConfirm={async (documentIds) => {
                await onPasteDocuments(contextPath, documentIds)
                setPickDocsOpen(false)
              }}
              onClose={() => setPickDocsOpen(false)}
            />
          </div>
        </>
      )}

      <DocumentDetailModal
        document={detailModal?.document ?? null}
        isOpen={!!detailModal}
        onClose={() => setDetailModal(null)}
        workspaceId={workspaceId}
        initialTab={detailModal?.tab}
      />
    </div>
  )
}

export default DocumentList
