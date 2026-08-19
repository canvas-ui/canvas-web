import { Document, TreeNode } from '@/types/workspace'
import { File, Calendar, Hash, Eye, ExternalLink, Globe, X, Trash2, Copy, Move, Clipboard, CheckSquare, Square, Download, Upload, Search, Save, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Scissors, Link, Link2, Pencil, PanelRight, FileSearch, LayoutGrid, LayoutList, MoreVertical, Play, Table as TableIcon, HardDrive, ArrowRightLeft } from 'lucide-react'
import { LinkToCard, type LinkToTarget, type LinkToRelation } from '@/components/menu/shared/LinkToCard'
import { BackendActionCard } from '@/components/menu/shared/BackendActionCard'
import { PickDocumentsCard } from '@/components/menu/shared/PickDocumentsCard'
import { transferDocumentsToBackends, createDocumentRelations, type BackendTransferMode } from '@/services/workspace'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useSideView } from '@/components/shell/use-side-view'
import { useState, useCallback, useMemo, useEffect, useRef, useDeferredValue } from 'react'
import { createPortal } from 'react-dom'
import Fuse from 'fuse.js'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SortableTableHead,
} from '@/components/ui/table'
import { useSortableData } from '@/components/ui/use-sortable-data'
import { Button } from '@/components/ui/button'
import { ContextMenuShell } from '@/components/common/context-menu-shell'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { announceRelationsChanged } from '@/lib/relation-events'
import { ObjectPropertiesModal } from '@/components/object-card/ObjectPropertiesModal'
import { isEditableSchema } from '@/components/object-card/editable-schema'
import { usePublicShareCode } from '@/components/renderers/public-share'
import { useDocumentThumbnail } from '@/components/renderers/useDocumentThumbnail'
import { useDocumentStreamSrc } from '@/components/renderers/useDocumentBlobUrl'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { TimelineSortControl } from '@/components/canvas/widgets/sort-control'
import type { ToolboxSort } from '@/types/workspace'

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
  onImportDocuments?: (documents: Record<string, unknown>[], contextPath: string) => Promise<boolean>
  onSelectionChange?: (documentIds: number[]) => void
  pastedDocumentIds?: number[]
  viewMode?: 'card' | 'table' | 'tile'
  // When true, the list shows a table/tile/card view switcher and remembers the
  // choice in localStorage (the main folder browser). Widgets that hardcode a
  // viewMode leave this off and stay fixed.
  allowViewToggle?: boolean
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
  // Server-side view order (timeline sort). When onServerSortChange is provided
  // the toolbar shows a sort control; the choice reorders the whole result set
  // (across pages) and, on canvas save, persists into the canvas querySpec.
  serverSort?: ToolboxSort
  onServerSortChange?: (sort: ToolboxSort) => void
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
  // Explicit paste target tree. Set by "Link to…", where the destination tree
  // is chosen in the LinkToCard and differs from whatever tree is currently in
  // view (e.g. linking out of a read-only backends path into a context tree).
  // Falls back to the current view's tree when unset.
  targetTreeName?: string
  targetTreeType?: 'context' | 'directory'
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

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  documents: Document[]
  selectedDocuments: Set<number>
}

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (documents: Record<string, unknown>[]) => Promise<boolean>
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

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 bg-scrim flex items-center justify-center z-50 p-4 max-md:p-2">
      <div className="bg-background border rounded-lg max-w-3xl w-full max-h-viewport-card overflow-y-auto max-md:h-full max-md:max-h-none max-md:max-w-none">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">Export Documents</h2>
              <p className="text-muted-foreground">
                Exporting {documentsToExport.length} document{documentsToExport.length !== 1 ? 's' : ''}
                {copyStatus === 'copied' && <span className="text-success ml-2">✓ Copied to clipboard!</span>}
                {copyStatus === 'error' && <span className="text-destructive ml-2">✗ Failed to copy</span>}
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
    </div>,
    window.document.body,
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
    } catch {
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

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 bg-scrim flex items-center justify-center z-50 p-4 max-md:p-2">
      <div className="bg-background border rounded-lg max-w-3xl w-full max-h-viewport-card overflow-y-auto max-md:h-full max-md:max-h-none max-md:max-w-none">
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
                placeholder='[{"schema": "data/schema/tab", "schemaVersion": "2.0", "data": {...}, "metadata": {...}}]'
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
              <p><strong>Example schemas:</strong> "data/schema/tab", "data/schema/file", etc.</p>
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
    </div>,
    window.document.body,
  )
}

interface DocumentActionSheetProps {
  document: Document
  open: boolean
  onClose: () => void
  onViewDetails: () => void
  onEdit?: () => void
  onLink?: () => void
  onOpenToSide?: () => void
  onRemove?: () => void
  onDelete?: () => void
}

// Mobile replacement for the row action icon strip: a full-screen slide-in
// card. Actions anchor to the bottom of the screen so everything is reachable
// one-handed; the empty top area and Cancel both dismiss.
function DocumentActionSheet({ document, open, onClose, onViewDetails, onEdit, onLink, onOpenToSide, onRemove, onDelete }: DocumentActionSheetProps) {
  useEscapeClose(onClose, open)

  if (!open) return null
  const display = getDocumentDisplayInfo(document)
  const run = (fn: () => void) => () => { onClose(); fn() }

  const actionClass = 'flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-4 text-base font-medium transition-transform active:scale-[.98]'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-fullscreen flex flex-col bg-background animate-in slide-in-from-bottom-10 fade-in duration-200"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-start gap-3 border-b p-4" onClick={(e) => e.stopPropagation()}>
        <DocumentIcon document={document} chip />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{display.title}</div>
          <div className="truncate text-xs text-muted-foreground">ID: {document.id} · {document.schema}</div>
        </div>
        <button onClick={onClose} className="rounded-sm p-2 hover:bg-muted" title="Close" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Empty flex spacer — tapping it dismisses, keeping actions in thumb reach */}
      <div className="flex-1" />

      <div
        className="shrink-0 space-y-2 px-4 pt-2"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1.25rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={run(onViewDetails)} className={actionClass}>
          <Eye className="h-5 w-5 shrink-0 text-muted-foreground" /> View details
        </button>
        {onEdit && (
          <button onClick={run(onEdit)} className={actionClass}>
            <Pencil className="h-5 w-5 shrink-0 text-muted-foreground" /> Edit
          </button>
        )}
        {onLink && (
          <button onClick={run(onLink)} className={actionClass}>
            <Link2 className="h-5 w-5 shrink-0 text-muted-foreground" /> Link to…
          </button>
        )}
        {onOpenToSide && (
          <button onClick={run(onOpenToSide)} className={actionClass}>
            <PanelRight className="h-5 w-5 shrink-0 text-muted-foreground" /> Open to the side
          </button>
        )}
        {onRemove && (
          <button onClick={run(onRemove)} className={actionClass}>
            <X className="h-5 w-5 shrink-0 text-muted-foreground" /> Remove from context
          </button>
        )}
        {onDelete && (
          <button onClick={run(onDelete)} className={`${actionClass} border-destructive/30 text-destructive`}>
            <Trash2 className="h-5 w-5 shrink-0" /> Delete permanently
          </button>
        )}
        <button onClick={onClose} className={`${actionClass} justify-center bg-muted`}>
          Cancel
        </button>
      </div>
    </div>,
    window.document.body,
  )
}

function DocumentTableRow({ document, isSelected, workspaceId, onSelect, onRemoveDocument, onDeleteDocument, onLinkDocument, onOpenToSide, onRightClick, onDragStart }: DocumentTableRowProps) {
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [detailEdit, setDetailEdit] = useState(false)
  const [actionSheet, setActionSheet] = useState(false)
  const isPublicShare = usePublicShareCode() != null
  const isEditable = isEditableSchema(document.schema)

  const isTabDocument = document.schema === 'data/schema/tab'
  const tabUrl = isTabDocument ? document.data.url : null
  const display = getDocumentDisplayInfo(document)

  const handleDragStart = (e: React.DragEvent) => {
    onDragStart?.(e, document.id);
  }

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const getPrimaryChecksum = () => {
    // Array position encodes primacy (matches synapsd's getPrimaryChecksum).
    const primary = document.checksumArray?.[0]
    if (primary) { const [algo, hash] = primary.split('/'); if (hash) return { algo, hash: hash.substring(0, 8) + '...' } }
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

  const handleViewDetails = (e: React.MouseEvent) => { e.stopPropagation(); setDetailEdit(false); setShowDetailModal(true) }
  const handleEditDocument = (e: React.MouseEvent) => { e.stopPropagation(); setDetailEdit(true); setShowDetailModal(true) }
  const handleRemoveDocument = (e: React.MouseEvent) => { e.stopPropagation(); onRemoveDocument?.(document.id) }
  const handleDeleteDocument = (e: React.MouseEvent) => { e.stopPropagation(); onDeleteDocument?.(document.id) }

  return (
    <>
      <TableRow
        className={`cursor-pointer ${isSelected ? 'bg-info-subtle hover:bg-info-subtle' : 'hover:bg-muted/50'}`}
        onClick={handleDocumentClick}
        onMouseDown={handleMouseDown}
        onContextMenu={handleRightClick}
        draggable
        onDragStart={handleDragStart}
      >
        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-primary align-middle"
            checked={!!isSelected}
            onChange={(e) => onSelect?.(document.id, e.target.checked, true)}
          />
        </TableCell>
        <TableCell className="w-12">
          <DocumentIcon document={document} chip />
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
        <TableCell className="hidden md:table-cell"><span className="px-2 py-1 text-xs bg-muted rounded border">{display.schemaLabel}</span></TableCell>
        <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{document.id}</TableCell>
        <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{primaryChecksum && (<span className="font-mono" title={`${primaryChecksum.algo} checksum`}>{primaryChecksum.hash}</span>)}</TableCell>
        <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{formatDate(document.createdAt)}</TableCell>
        <TableCell>
          <div className="hidden items-center gap-1 md:flex">
            <Button variant="ghost" size="sm" onClick={handleViewDetails} title="View document details"><Eye className="h-4 w-4" /></Button>
            {isEditable && !isPublicShare && (<Button variant="ghost" size="sm" onClick={handleEditDocument} title="Edit document"><Pencil className="h-4 w-4" /></Button>)}
            {onLinkDocument && (<Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onLinkDocument(document.id) }} title="Link document to other paths"><Link2 className="h-4 w-4" /></Button>)}
            {onOpenToSide && (<Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onOpenToSide(document) }} title="Open to the side"><PanelRight className="h-4 w-4" /></Button>)}
            {onRemoveDocument && (<Button variant="ghost" size="sm" onClick={handleRemoveDocument} title="Remove document from context"><X className="h-4 w-4" /></Button>)}
            {onDeleteDocument && (<Button variant="ghost" size="sm" onClick={handleDeleteDocument} title="Delete document permanently" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>)}
          </div>
          <Button variant="ghost" size="sm" className="md:hidden" onClick={(e) => { e.stopPropagation(); setActionSheet(true) }} title="Actions" aria-label="Document actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
      <DocumentActionSheet
        document={document}
        open={actionSheet}
        onClose={() => setActionSheet(false)}
        onViewDetails={() => { setDetailEdit(false); setShowDetailModal(true) }}
        onEdit={isEditable && !isPublicShare ? () => { setDetailEdit(true); setShowDetailModal(true) } : undefined}
        onLink={onLinkDocument ? () => onLinkDocument(document.id) : undefined}
        onOpenToSide={onOpenToSide ? () => onOpenToSide(document) : undefined}
        onRemove={onRemoveDocument ? () => onRemoveDocument(document.id) : undefined}
        onDelete={onDeleteDocument ? () => onDeleteDocument(document.id) : undefined}
      />
      <ObjectPropertiesModal document={document} isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} workspaceId={workspaceId} initialEdit={detailEdit} />
    </>
  )
}

function DocumentRow({ document, isSelected, workspaceId, onSelect, onRemoveDocument, onDeleteDocument, onLinkDocument, onOpenToSide, onRightClick, onDragStart }: DocumentRowProps) {
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [detailEdit, setDetailEdit] = useState(false)
  const [actionSheet, setActionSheet] = useState(false)
  const isPublicShare = usePublicShareCode() != null
  const isTabDocument = document.schema === 'data/schema/tab'
  const isEditable = isEditableSchema(document.schema)
  const tabUrl = isTabDocument ? document.data.url : null
  const display = getDocumentDisplayInfo(document)
  const isImage = isImageDocument(document)
  const hasThumb = isImage || isPdfDocument(document)
  // Small row preview — 128px render is plenty for a 56px square. Raw PDF
  // bytes can't render in an <img>, so PDFs skip the full-bytes fallback.
  const { blobUrl: rowThumbUrl, loading: rowThumbLoading } = useDocumentThumbnail(workspaceId ?? '', document.id, 128, { enabled: hasThumb, blobFallback: isImage })

  const handleDragStart = (e: React.DragEvent) => {
    onDragStart?.(e, document.id);
  }

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const getPrimaryChecksum = () => { const primary = document.checksumArray?.[0]; if (primary) { const [algo, hash] = primary.split('/'); if (hash) return { algo, hash: hash.substring(0, 8) + '...' } } return null }

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
  const handleViewDetails = (e: React.MouseEvent) => { e.stopPropagation(); setDetailEdit(false); setShowDetailModal(true) }
  const handleEditDocument = (e: React.MouseEvent) => { e.stopPropagation(); setDetailEdit(true); setShowDetailModal(true) }
  const handleRemoveDocument = (e: React.MouseEvent) => { e.stopPropagation(); onRemoveDocument?.(document.id) }
  const handleDeleteDocument = (e: React.MouseEvent) => { e.stopPropagation(); onDeleteDocument?.(document.id) }

  return (
    <>
      <div
        className={`border rounded-lg p-4 transition-colors cursor-pointer ${isSelected ? 'bg-info-subtle border-info ring-1 ring-info' : ''} ${isTabDocument && !isSelected ? 'hover:bg-info-subtle hover:border-info' : !isSelected ? 'hover:bg-accent/50' : ''}`}
        onClick={handleDocumentClick}
        onMouseDown={handleMouseDown}
        onContextMenu={handleRightClick}
        draggable
        onDragStart={handleDragStart}
      >
        <div className="flex items-start justify-between gap-4">
          {hasThumb && (
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted/40">
              {rowThumbUrl ? (
                <img src={rowThumbUrl} alt={display.title} loading="lazy" className="h-full w-full object-cover" />
              ) : rowThumbLoading ? (
                <div className="h-full w-full animate-pulse bg-muted/60" />
              ) : (
                <div className="flex h-full w-full items-center justify-center"><DocumentIcon document={document} /></div>
              )}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 overflow-hidden">
              <DocumentIcon document={document} chip />
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
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <button onClick={handleViewDetails} className="p-1 hover:bg-muted rounded-sm" title="View document details"><Eye className="h-4 w-4" /></button>
            {isEditable && !isPublicShare && (<button onClick={handleEditDocument} className="p-1 hover:bg-muted rounded-sm" title="Edit document"><Pencil className="h-4 w-4" /></button>)}
            {onLinkDocument && (<button onClick={(e) => { e.stopPropagation(); onLinkDocument(document.id) }} className="p-1 hover:bg-muted rounded-sm" title="Link document to other paths"><Link2 className="h-4 w-4" /></button>)}
            {onOpenToSide && (<button onClick={(e) => { e.stopPropagation(); onOpenToSide(document) }} className="p-1 hover:bg-muted rounded-sm" title="Open to the side"><PanelRight className="h-4 w-4" /></button>)}
            {onRemoveDocument && (<button onClick={handleRemoveDocument} className="p-1 hover:bg-muted rounded-sm" title="Remove document from context (keep in database)"><X className="h-4 w-4" /></button>)}
            {onDeleteDocument && (<button onClick={handleDeleteDocument} className="p-1 hover:bg-destructive hover:text-destructive-foreground rounded-sm text-destructive" title="Delete document permanently from database"><Trash2 className="h-4 w-4" /></button>)}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setActionSheet(true) }}
            className="p-2 hover:bg-muted rounded-sm md:hidden"
            title="Actions"
            aria-label="Document actions"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>
      <DocumentActionSheet
        document={document}
        open={actionSheet}
        onClose={() => setActionSheet(false)}
        onViewDetails={() => { setDetailEdit(false); setShowDetailModal(true) }}
        onEdit={isEditable && !isPublicShare ? () => { setDetailEdit(true); setShowDetailModal(true) } : undefined}
        onLink={onLinkDocument ? () => onLinkDocument(document.id) : undefined}
        onOpenToSide={onOpenToSide ? () => onOpenToSide(document) : undefined}
        onRemove={onRemoveDocument ? () => onRemoveDocument(document.id) : undefined}
        onDelete={onDeleteDocument ? () => onDeleteDocument(document.id) : undefined}
      />
      <ObjectPropertiesModal document={document} isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} workspaceId={workspaceId} initialEdit={detailEdit} />
    </>
  )
}

function isImageDocument(document: Document): boolean {
  return document.schema === 'data/schema/file'
    && String(document.metadata?.contentType || '').startsWith('image/')
}

function isVideoDocument(document: Document): boolean {
  return document.schema === 'data/schema/file'
    && String(document.metadata?.contentType || '').startsWith('video/')
}

// PDFs get a server-rendered first-page thumbnail through the same endpoint
// as images (webp, cached content-addressed server-side).
function isPdfDocument(document: Document): boolean {
  return document.schema === 'data/schema/file'
    && String(document.metadata?.contentType || '') === 'application/pdf'
}

// First-frame preview for video tiles: a bare <video preload="metadata"> —
// the browser fetches only the header + first frame over the existing
// range-capable content endpoint (media-ticket auth via useDocumentStreamSrc).
// No server-side thumbnailing (no ffmpeg) involved.
function TileVideoPreview({ workspaceId, documentId, fallback }: { workspaceId: string; documentId: number; fallback: React.ReactNode }) {
  const { src, error } = useDocumentStreamSrc(workspaceId, documentId)
  const [failed, setFailed] = useState(false)
  if (error || failed) return <>{fallback}</>
  if (!src) return <div className="aspect-video w-full animate-pulse bg-muted/60" />
  return (
    <div className="relative">
      <video src={src} preload="metadata" muted playsInline onError={() => setFailed(true)} className="block h-auto w-full" />
      <span className="pointer-events-none absolute bottom-2 right-2 rounded-sm bg-scrim p-1 text-scrim-foreground">
        <Play className="h-3.5 w-3.5" />
      </span>
    </div>
  )
}

// Tile view cell — a prominent picture/thumbnail tile (image docs) or a large
// icon tile (everything else). Mirrors DocumentRow's click/selection/right-click
// behavior. Sized for a responsive auto-fill grid, so it reads on mobile too.
function DocumentTile({ document, isSelected, workspaceId, onSelect, onOpenToSide, onRightClick, onDragStart }: DocumentRowProps) {
  const [showDetailModal, setShowDetailModal] = useState(false)
  const isTabDocument = document.schema === 'data/schema/tab'
  const tabUrl = isTabDocument ? document.data.url : null
  const isImage = isImageDocument(document)
  const isVideo = isVideoDocument(document)
  // Images and PDFs share the thumbnail pipeline (PDFs render page 1
  // server-side); a PDF with unreachable bytes falls back to the icon tile.
  const hasThumb = isImage || isPdfDocument(document)
  const display = getDocumentDisplayInfo(document)
  // Notes, tabs/URLs, emails, todos: the content IS the picture — render a
  // text tile (title + clamped body, or just title + status subtitle) instead
  // of a giant icon. Files keep the icon tile.
  const isTextTile = !hasThumb && document.schema !== 'data/schema/file' && !!(display.preview || display.subtitle)
  // 768px render keeps the larger (300px column, retina) photo tiles crisp.
  const { blobUrl, loading } = useDocumentThumbnail(workspaceId ?? '', document.id, 768, { enabled: hasThumb, blobFallback: isImage })

  const handleClick = (e: React.MouseEvent) => {
    const isCtrlClick = e.ctrlKey || e.metaKey
    if (onSelect) onSelect(document.id, isCtrlClick ? !isSelected : true, isCtrlClick)
    if (!isCtrlClick) { if (isTabDocument && tabUrl) { window.open(tabUrl, '_blank', 'noopener,noreferrer') } else { setShowDetailModal(true) } }
  }
  const handleRightClick = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); if (onSelect && !isSelected) onSelect(document.id, true, false); onRightClick?.(e, document.id) }

  return (
    <>
      <div
        className={`group relative mb-3 flex break-inside-avoid flex-col overflow-hidden rounded-lg border transition-shadow cursor-pointer hover:shadow-elevation-2 ${isSelected ? 'ring-2 ring-info border-info' : ''}`}
        onClick={handleClick}
        onContextMenu={handleRightClick}
        draggable
        onDragStart={(e) => onDragStart?.(e, document.id)}
        title={display.title}
      >
        {/* Selection checkbox — always visible when selected, on hover otherwise */}
        <input
          type="checkbox"
          className={`absolute left-2 top-2 z-10 h-4 w-4 cursor-pointer accent-primary ${isSelected ? '' : 'reveal-on-hover'}`}
          checked={isSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onSelect?.(document.id, e.target.checked, true)}
        />
        {/* Images, videos and text tiles take their natural height (masonry
            columns); icon tiles stay square. */}
        <div className={`relative w-full bg-muted/40 ${(hasThumb && blobUrl) || isTextTile || (isVideo && workspaceId) ? '' : 'aspect-square'}`}>
          {hasThumb && loading && <div className="absolute inset-0 animate-pulse bg-muted/60" />}
          {hasThumb && blobUrl ? (
            <img src={blobUrl} alt={display.title} loading="lazy" className="block h-auto w-full" />
          ) : isVideo && workspaceId ? (
            <TileVideoPreview
              workspaceId={workspaceId}
              documentId={document.id}
              fallback={<div className="flex aspect-square w-full items-center justify-center"><DocumentIcon document={document} size={10} chip /></div>}
            />
          ) : isTextTile ? (
            <div className="flex min-h-28 w-full flex-col gap-1.5 overflow-hidden bg-card p-3 pt-7 text-left">
              <div className="flex items-center gap-1.5">
                <DocumentIcon document={document} />
                <span className="min-w-0 truncate text-[10px] uppercase tracking-wide text-muted-foreground">{display.schemaLabel}</span>
              </div>
              <div className="line-clamp-2 text-sm font-semibold leading-snug">{display.title}</div>
              {display.subtitle && (
                <div className="truncate text-[11px] text-info">{display.subtitle}</div>
              )}
              {/* The "CSS magic": -webkit-line-clamp — up to 8 body lines,
                  then an ellipsis; shorter notes make shorter tiles. */}
              <p className="line-clamp-[8] text-xs leading-relaxed text-muted-foreground">{display.preview}</p>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <DocumentIcon document={document} size={10} chip />
            </div>
          )}
          {onOpenToSide && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenToSide(document) }}
              className="absolute right-2 top-2 rounded-sm bg-scrim p-1 text-scrim-foreground reveal-on-hover"
              title="Open to the side"
            >
              <PanelRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* Text tiles carry their title inside the tile body already. */}
        {!isTextTile && (
          <div className="flex items-center gap-1.5 border-t bg-card px-2 py-1.5">
            <span className="truncate text-xs font-medium" title={display.title}>{display.title}</span>
            {display.isExternal && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />}
          </div>
        )}
      </div>
      <ObjectPropertiesModal document={document} isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} workspaceId={workspaceId} />
    </>
  )
}

export function DocumentList({ documents, isLoading, contextPath, treeName, workspaceId, totalCount, onRemoveDocument, onDeleteDocument, onDestroyDocument, onRemoveDocuments, onDeleteDocuments, onDestroyDocuments, onCopyDocuments, onCutDocuments, onPasteDocuments, onImportDocuments, onSelectionChange, pastedDocumentIds, viewMode = 'card', allowViewToggle = false, activeContextUrl, currentContextUrl, currentPage = 1, pageSize = 50, onPageChange, onPageSizeChange, onPurgeDocuments, disablePurgeDocuments = false, backendSearchQueries = [], onBackendSearch, onRemoveBackendQuery, serverSort, onServerSortChange, scope = 'path', onScopeChange, canSaveChanges = false, isSavingChanges = false, onSaveChanges, linkTree }: DocumentListProps) {
  // View switcher (table/tile/card). Only active when allowViewToggle; the
  // chosen view is remembered in localStorage. Widgets that hardcode viewMode
  // leave the toggle off and pin their view.
  const [storedView, setStoredView] = useState<'card' | 'table' | 'tile'>(() => {
    if (!allowViewToggle) return viewMode
    try {
      const saved = localStorage.getItem('doclist:view')
      if (saved === 'card' || saved === 'table' || saved === 'tile') return saved
    } catch { /* ignore */ }
    return viewMode
  })
  const view = allowViewToggle ? storedView : viewMode
  const changeView = useCallback((v: 'card' | 'table' | 'tile') => {
    setStoredView(v)
    try { localStorage.setItem('doclist:view', v) } catch { /* ignore */ }
  }, [])
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; documentIds: number[] } | null>(null)
  const [linkPanelIds, setLinkPanelIds] = useState<number[] | null>(null)
  const [relationSaving, setRelationSaving] = useState(false)
  // Copy to / Move to / Delete from backend — the backend twin of the link panel.
  const [backendPanel, setBackendPanel] = useState<{ ids: number[]; mode: BackendTransferMode } | null>(null)
  const [backendSaving, setBackendSaving] = useState(false)
  const [pickDocsOpen, setPickDocsOpen] = useState(false)
  const [detailModal, setDetailModal] = useState<{ document: Document; edit?: boolean } | null>(null)
  const canLink = Boolean(linkTree && onPasteDocuments)
  // Backend actions need a workspace to address; the picker is otherwise
  // identical in every view that lists documents.
  const canUseBackends = Boolean(workspaceId)
  const { showSuccessToast, showErrorToast } = useToastHelpers()
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
  const searchInputRef = useRef<HTMLInputElement>(null)
  // Clear both the filter state and the uncontrolled input's DOM value. The
  // search box is uncontrolled (see the input) so programmatic clears must
  // reset the element directly.
  const resetSearchInput = useCallback(() => {
    setSearchQuery('')
    if (searchInputRef.current) searchInputRef.current.value = ''
  }, [])

  // Autofocus the search box on the primary browsing surface (not in side
  // panes / canvas widgets, which would fight for focus). Desktop only —
  // on mobile it would pop the on-screen keyboard on every navigation and
  // cover the document list. onFocus still handles the keyboard-occlusion
  // scroll when the user taps it on mobile.
  useEffect(() => {
    if (!allowViewToggle) return
    if (window.matchMedia('(max-width: 767px)').matches) return
    const el = searchInputRef.current
    if (!el) return
    const t = setTimeout(() => el.focus(), 60)
    return () => clearTimeout(t)
  }, [allowViewToggle])

  // Clear selection when context path changes (during render — prev-value-in-
  // state — so no effect round-trip)
  const [prevContextPath, setPrevContextPath] = useState(contextPath)
  if (contextPath !== prevContextPath) {
    setPrevContextPath(contextPath)
    setSelectedDocuments(new Set())
  }

  // Content-header "Link selection" button (DefaultCanvas) — selection + the
  // LinkTo modal live here, so it just pings us.
  useEffect(() => {
    const onLinkSelection = () => {
      if (canLink && selectedDocuments.size > 0) setLinkPanelIds(Array.from(selectedDocuments))
    }
    window.addEventListener('workspace:documents:link-selection', onLinkSelection)
    return () => window.removeEventListener('workspace:documents:link-selection', onLinkSelection)
  }, [canLink, selectedDocuments])

  // Expose selection to parent (for cross-pane F5/F6 transfers)
  useEffect(() => {
    onSelectionChange?.(Array.from(selectedDocuments))
  }, [selectedDocuments, onSelectionChange])

  const submitBackendSearch = useCallback(() => {
    if (!onBackendSearch) return
    const q = searchQuery.trim()
    if (!q) return
    onBackendSearch(q)   // parent appends to the stack
    resetSearchInput()   // clear buffer for the next refinement
  }, [onBackendSearch, searchQuery, resetSearchInput])

  const clearAllSearch = useCallback(() => {
    resetSearchInput()
    if (onRemoveBackendQuery && backendSearchQueries.length > 0) onRemoveBackendQuery(-1) // clear all
  }, [onRemoveBackendQuery, backendSearchQueries.length, resetSearchInput])
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

  // Filter documents based on search query. Defer the query so the expensive
  // fuse pass (+ list re-render) lags behind keystrokes instead of running
  // synchronously on each one — keeps the input snappy on slow devices.
  const deferredQuery = useDeferredValue(searchQuery)
  const filteredDocuments = useMemo(() => {
    if (!deferredQuery.trim()) return documents
    if (!fuse) return documents

    const searchResults = fuse.search(deferredQuery)
    return searchResults.map(result => result.item)
  }, [documents, deferredQuery, fuse])

  // Column sort for the table view
  const sortAccessors = useMemo(() => ({
    title: (d: Document) => getDocumentDisplayInfo(d).title?.toLowerCase() ?? '',
    schema: (d: Document) => getDocumentDisplayInfo(d).schemaLabel ?? '',
    // Group by kind: mime content-type first (jpeg/png/pdf…), else the schema.
    type: (d: Document) => (d.metadata?.contentType || d.schema || '').toLowerCase(),
    id: (d: Document) => d.id,
    created: (d: Document) => Date.parse(d.createdAt) || 0,
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
    // Modals portal to <body> but React synthetic events still bubble through
    // the JSX tree — leave right-clicks inside any dialog to the browser.
    if ((event.target as HTMLElement).closest?.('[role="dialog"]')) return
    event.preventDefault()
    event.stopPropagation() // Prevent bubbling to empty area handler
    let targetIds: number[]
    if (selectedDocuments.has(documentId)) { targetIds = Array.from(selectedDocuments) } else { targetIds = [documentId]; setSelectedDocuments(new Set([documentId])) }
    setContextMenu({ x: event.clientX, y: event.clientY, documentIds: targetIds })
  }, [selectedDocuments])

  // Relations branch of the same card: every selected document gets the picked
  // edge to every picked target. Direction is an axis — 'in' flips which side
  // is the subject, it does not change the predicate.
  const handleRelationConfirm = useCallback(async (relation: LinkToRelation, documentIds: number[]) => {
    if (documentIds.length === 0 || relation.targetIds.length === 0) return
    setRelationSaving(true)
    try {
      for (const documentId of documentIds) {
        await createDocumentRelations(workspaceId!, documentId, relation.predicate, relation.targetIds, relation.direction)
      }
      const edges = documentIds.length * relation.targetIds.length
      showSuccessToast(`Created ${edges} relation${edges !== 1 ? 's' : ''}`)
      announceRelationsChanged()
      setLinkPanelIds(null)
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to create relations')
    } finally {
      setRelationSaving(false)
    }
  }, [workspaceId, showSuccessToast, showErrorToast])

  const handleLinkConfirm = useCallback(async (paths: string[], documentIds: number[], ctx?: LinkToTarget) => {
    if (!onPasteDocuments) return
    for (const path of paths) {
      // Link into the tree chosen in the LinkToCard, not the current view's
      // tree — otherwise linking out of a backends path targets the read-only
      // backends tree and fails.
      await onPasteDocuments(path, documentIds, {
        move: false,
        targetTreeName: ctx?.treeName,
        targetTreeType: ctx?.treeType,
      })
    }
    setSelectedDocuments(new Set())
  }, [onPasteDocuments])

  const handleBackendTransfer = useCallback(async (
    backends: string[],
    mode: BackendTransferMode,
    options: { keepDocument: boolean },
  ) => {
    if (!workspaceId || !backendPanel) return
    setBackendSaving(true)
    try {
      const result = await transferDocumentsToBackends(workspaceId, backendPanel.ids, {
        to: backends,
        mode,
        keepDocument: options.keepDocument,
      })
      // A document already living on the target is a no-op, not a transfer —
      // counting it as done would make a repeat click look like work happened.
      const unchanged = result.successful.filter(s => s.transfers?.every(t => t.state === 'unchanged')).length
      const done = result.successful.length - unchanged
      const failed = result.failed.length
      const verb = mode === 'delete' ? 'Deleted from' : mode === 'move' ? 'Moved to' : 'Copied to'
      const where = backends.join(', ')
      const notes = [
        unchanged ? `${unchanged} already there` : null,
        failed ? `${failed} skipped` : null,
      ].filter(Boolean).join(' · ')

      if (done > 0) showSuccessToast(`${verb} ${where}: ${done} document${done !== 1 ? 's' : ''}${notes ? ` · ${notes}` : ''}`)
      else if (unchanged > 0) showSuccessToast(`Nothing to do — already on ${where}`)
      else if (failed > 0) showErrorToast(result.failed[0]?.reason || 'Transfer failed')
      if (failed > 0) console.warn('Backend transfer skipped documents:', result.failed)

      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
      setBackendPanel(null)
      setSelectedDocuments(new Set())
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBackendSaving(false)
    }
  }, [workspaceId, backendPanel, showSuccessToast, showErrorToast])

  const handleContextMenuAction = useCallback(async (action: string, documentIds: number[]) => {
    switch (action) {
      case 'edit':
        if (documentIds.length === 1) {
          const doc = documents.find(d => d.id === documentIds[0])
          if (doc) { setDetailModal({ document: doc, edit: true }); setContextMenu(null); return }
        }
        break
      case 'copy': onCopyDocuments?.(documentIds); break
      case 'cut': onCutDocuments?.(documentIds); break
      case 'link-to': setLinkPanelIds(documentIds); setContextMenu(null); return
      case 'remove':
        if (documentIds.length === 1) onRemoveDocument?.(documentIds[0])
        else onRemoveDocuments?.(documentIds)
        break
      case 'delete':
        if (documentIds.length === 1) onDeleteDocument?.(documentIds[0])
        else onDeleteDocuments?.(documentIds)
        break
      case 'destroy':
        if (documentIds.length === 1) onDestroyDocument?.(documentIds[0])
        else onDestroyDocuments?.(documentIds)
        break
      case 'view-details':
        if (documentIds.length === 1) {
          const doc = documents.find(d => d.id === documentIds[0]);
          if (doc) { setDetailModal({ document: doc }); setContextMenu(null); return }
        }
        break;
      case 'open-url':
        if (documentIds.length === 1) {
          const document = documents.find(doc => doc.id === documentIds[0]);
          if (document && document.schema === 'data/schema/tab' && document.data.url) {
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
  }, [onCopyDocuments, onCutDocuments, onRemoveDocument, onRemoveDocuments, onDeleteDocument, onDeleteDocuments, onDestroyDocument, onDestroyDocuments, documents])

  const handleEmptyAreaRightClick = useCallback((event: React.MouseEvent) => {
    // Right-clicks inside a portaled dialog bubble here via the React tree —
    // keep the browser's default menu (text copy etc.) there.
    if ((event.target as HTMLElement).closest?.('[role="dialog"]')) return
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

  const handleImport = useCallback(async (importedDocuments: Record<string, unknown>[]) => {
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
            <p className="text-xs text-muted-foreground mt-1 break-all">Context: <span className="font-mono">{contextPath}</span>{activeContextUrl && currentContextUrl && activeContextUrl !== currentContextUrl && (<span className="text-warning ml-2">(not yet active)</span>)}</p>
            {selectedDocuments.size > 0 && (<p className="text-xs text-info mt-1">{selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected</p>)}
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
          {/* flex-wrap: on narrow screens the scope toggle stays on top and the
              search input wraps to its own full-width line (min-w forces the
              wrap) instead of being squeezed to a sliver. */}
          <div className="relative flex flex-wrap items-center gap-2">
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
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={onBackendSearch ? (hasServerSearch ? 'Refine: add another query (Enter)…' : 'Search documents (Enter for server search)…') : 'Search documents...'}
                // UNCONTROLLED (no `value` prop): the DOM owns the text while
                // typing, so mobile IMEs (Gboard composes even latin text) aren't
                // fought by a controlled write-back — that both broke typing and
                // reversed characters. `searchQuery` state still mirrors it via
                // onChange for filtering; programmatic clears reset the DOM via
                // `resetSearchInput` (the ref).
                defaultValue=""
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={(e) => {
                  // Mobile: the keyboard covers the field (PWA standalone often
                  // doesn't auto-scroll it into view). Scroll it up once the
                  // keyboard has animated in.
                  const el = e.currentTarget
                  if (window.matchMedia('(max-width: 767px)').matches) {
                    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)
                  }
                }}
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
                title={hasServerSearch ? 'Refine: narrow the current results by this query' : 'Run full-text search on the server'}
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
                {isSavingChanges ? 'Saving...' : 'Save filters'}
              </Button>
            )}
          </div>
          {hasServerSearch && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Server search:</span>
              {backendSearchQueries.map((q, i) => (
                <span key={`${q}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground/70 font-medium uppercase text-[10px]">then</span>}
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
          // Wraps rather than overflowing: on a 360px screen this row is far
          // wider than the viewport, and it used to push the paging buttons
          // off the right edge with no way to scroll to them.
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Show:</span>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
                className="h-control-sm rounded-(--input-radius) border-(length:--input-border-width) border-input bg-background px-2 text-sm focus-ring"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <span className="max-sm:sr-only">per page</span>
            </div>

            <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-center">
              {/* Redundant with "Page N of M" beside the arrows, so it is the
                  first thing to go when space is tight. */}
              <span className="text-sm text-muted-foreground max-md:hidden">
                Showing {Math.min((currentPage - 1) * pageSize + 1, totalCount)} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(1)}
                  disabled={currentPage === 1}
                  className="p-1 touch-target"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-1 touch-target"
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
                  className="p-1 touch-target"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(Math.ceil(totalCount / pageSize))}
                  disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                  className="p-1 touch-target"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {documents.length > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
            {onServerSortChange && serverSort && workspaceId && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Sort</span>
                <TimelineSortControl workspaceId={workspaceId} value={serverSort} onChange={onServerSortChange} />
              </div>
            )}
            {allowViewToggle && (
              <div className="flex items-center rounded-md border p-0.5 touch-target">
                {([
                  ['table', TableIcon, 'Table view'],
                  ['tile', LayoutGrid, 'Tile view'],
                  ['card', LayoutList, 'Card view'],
                ] as const).map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => changeView(mode)}
                    title={label}
                    aria-pressed={view === mode}
                    className={`rounded-sm p-1.5 transition-colors ${view === mode ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            )}
            {/* Table view has a header select-all checkbox; card/tile views need this button. */}
            {view !== 'table' && (
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

                {canUseBackends && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBackendPanel({ ids: Array.from(selectedDocuments), mode: 'copy' })}
                    className="flex items-center gap-2"
                    title="Copy, move, or delete the file data on storage backends"
                  >
                    <HardDrive className="h-4 w-4" />
                    Backends… ({selectedDocuments.size})
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
                    Remove (unlink) from folder ({selectedDocuments.size})
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
                onClick={resetSearchInput}
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
      ) : view === 'tile' ? (
        <div className="flex-1 overflow-y-auto" onContextMenu={handleEmptyAreaRightClick}>
          {/* Masonry via CSS columns: image tiles keep their natural aspect,
              so column heights interleave into a 500px-style mosaic. Wide
              columns (fewer per row) make photos read big, like a feed. */}
          <div className="columns-[300px] gap-3 pr-2">
            {filteredDocuments.map((document) => (
              <DocumentTile key={document.id} document={document} isSelected={selectedDocuments.has(document.id)} workspaceId={workspaceId} onSelect={handleDocumentSelect} onRemoveDocument={removeDocument} onDeleteDocument={onDeleteDocument} onLinkDocument={canLink ? (id) => setLinkPanelIds([id]) : undefined} onOpenToSide={openToSide} onRightClick={handleDocumentRightClick} onDragStart={handleMultiDragStart} />
            ))}
          </div>
        </div>
      ) : view === 'table' ? (
        <div className="flex-1 overflow-y-auto" onContextMenu={handleEmptyAreaRightClick}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-primary align-middle"
                    checked={filteredDocuments.length > 0 && selectedDocuments.size === filteredDocuments.length}
                    ref={(el) => { if (el) el.indeterminate = selectedDocuments.size > 0 && selectedDocuments.size < filteredDocuments.length }}
                    onChange={handleSelectAll}
                    title="Select all on this page"
                  />
                </TableHead>
                <SortableTableHead label="Type" sortKey="type" sort={sort} onSort={toggleSort} className="w-12" />
                <SortableTableHead label="Title" sortKey="title" sort={sort} onSort={toggleSort} />
                <SortableTableHead label="Schema" sortKey="schema" sort={sort} onSort={toggleSort} className="hidden md:table-cell" />
                <SortableTableHead label="ID" sortKey="id" sort={sort} onSort={toggleSort} className="hidden lg:table-cell" />
                <TableHead className="hidden lg:table-cell">Checksum</TableHead>
                <SortableTableHead label="Created" sortKey="created" sort={sort} onSort={toggleSort} className="hidden sm:table-cell" />
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

      {contextMenu && (
        <ContextMenuShell
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          className="bg-background border rounded-lg shadow-elevation-3 py-1 min-w-[120px]"
        >
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
                  const isEditable = document?.schema === 'data/schema/note' || document?.schema === 'data/schema/link';
                  return isEditable ? (
                    <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" onClick={() => handleContextMenuAction('edit', contextMenu.documentIds)}>
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  ) : null;
                })()}
                {(() => {
                  const document = documents.find(doc => doc.id === contextMenu.documentIds[0]);
                  const isTabDocument = document?.schema === 'data/schema/tab';
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
                <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" title="Unlinks from this folder; the document stays in the index" onClick={() => handleContextMenuAction('remove', contextMenu.documentIds)}>
                  <Move className="h-3 w-3" />
                  Remove (unlink) from folder {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
                </button>
              </>
            )}
            {(onDeleteDocument || onDeleteDocuments) && (
              <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2 text-destructive" title="Removes the document from the index entirely; file data stays on its backend(s)" onClick={() => handleContextMenuAction('delete', contextMenu.documentIds)}>
                <Trash2 className="h-3 w-3" />
                Delete from index {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
              </button>
            )}
            {/* Backends — only for a selection that actually has file data on a
                backend (a non-empty locations array); JSON-only docs have no
                bytes to move. */}
            {canUseBackends
              && contextMenu.documentIds.some(id => ((documents.find(doc => doc.id === id) as { locations?: unknown[] } | undefined)?.locations?.length ?? 0) > 0) && (
              <>
                <div className="my-1 h-px bg-border" />
                <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Backends</div>
                <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" title="Copy the file data to another storage backend (keeps the existing copies)" onClick={() => { setBackendPanel({ ids: contextMenu.documentIds, mode: 'copy' }); setContextMenu(null) }}>
                  <HardDrive className="h-3 w-3" />
                  Copy to backend… {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
                </button>
                <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" title="Move the file data to another storage backend (source released once the copy is durable)" onClick={() => { setBackendPanel({ ids: contextMenu.documentIds, mode: 'move' }); setContextMenu(null) }}>
                  <ArrowRightLeft className="h-3 w-3" />
                  Move to backend… {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
                </button>
                <button className="w-full text-left px-3 py-1 hover:bg-destructive hover:text-destructive-foreground text-sm flex items-center gap-2 text-destructive font-medium" title="Delete the file data from selected backends (copies elsewhere are kept)" onClick={() => { setBackendPanel({ ids: contextMenu.documentIds, mode: 'delete' }); setContextMenu(null) }}>
                  <Trash2 className="h-3 w-3" />
                  Delete from backend… {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
                </button>
              </>
            )}
            {/* Legacy whole-object destroy (every location at once) — kept for
                views that pass the handler explicitly. */}
            {!canUseBackends && (onDestroyDocument || onDestroyDocuments)
              && contextMenu.documentIds.some(id => ((documents.find(doc => doc.id === id) as { locations?: unknown[] } | undefined)?.locations?.length ?? 0) > 0) && (
              <button className="w-full text-left px-3 py-1 hover:bg-destructive hover:text-destructive-foreground text-sm flex items-center gap-2 text-destructive font-medium" title="Deletes the document and its file data from the storage backend(s)" onClick={() => handleContextMenuAction('destroy', contextMenu.documentIds)}>
                <Trash2 className="h-3 w-3" />
                Delete from backend(s) {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
              </button>
            )}
        </ContextMenuShell>
      )}

      {/* Empty Area Context Menu */}
      {emptyAreaContextMenu && (
        <ContextMenuShell
          x={emptyAreaContextMenu.x}
          y={emptyAreaContextMenu.y}
          onClose={() => setEmptyAreaContextMenu(null)}
          className="bg-background border rounded-lg shadow-elevation-3 py-1 min-w-[120px]"
        >
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
        </ContextMenuShell>
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

      {linkPanelIds && linkTree && createPortal(
        // Dimmed modal — was an undimmed bottom-right float, which collided
        // with the bottom-right toolbox FAB and any open B5Card.
        <div className="fixed inset-0 z-picker flex items-center justify-center bg-scrim p-4 max-md:p-2">
          <LinkToCard
            documentCount={linkPanelIds.length}
            fixedWorkspaceName={workspaceId}
            // Relations sit beside the two trees: "where does this belong" and
            // "what does this point at" are the same gesture for the user, and
            // the selection is already in hand here.
            tabs={['context', 'directory', 'relations']}
            saving={relationSaving}
            relationExcludeIds={new Set(linkPanelIds)}
            onConfirm={(paths, ctx) => handleLinkConfirm(paths, linkPanelIds, ctx)}
            onConfirmRelation={(relation) => handleRelationConfirm(relation, linkPanelIds)}
            onClose={() => setLinkPanelIds(null)}
          />
        </div>,
        window.document.body,
      )}

      {backendPanel && workspaceId && createPortal(
        <div className="fixed inset-0 z-picker flex items-center justify-center bg-scrim p-4 max-md:p-2">
          <BackendActionCard
            workspaceId={workspaceId}
            documentCount={backendPanel.ids.length}
            initialMode={backendPanel.mode}
            saving={backendSaving}
            onConfirm={handleBackendTransfer}
            onClose={() => { if (!backendSaving) setBackendPanel(null) }}
          />
        </div>,
        window.document.body,
      )}

      {pickDocsOpen && onPasteDocuments && createPortal(
        // Flat, no backdrop dim on desktop — docks to the right edge like
        // DocumentSideCard rather than a centered modal. On mobile it becomes
        // an M1/M2-style drawer over a scrim.
        <>
          <div className="fixed inset-0 z-picker-scrim bg-scrim animate-fade-in md:hidden" onClick={() => setPickDocsOpen(false)} aria-hidden />
          <div className="fixed inset-y-0 right-0 z-picker flex items-stretch py-2 pr-2 max-md:bottom-2 max-md:left-2 max-md:top-2 max-md:py-0 max-md:pr-0 max-md:animate-fade-in">
            <PickDocumentsCard
              sizeClassName="h-full w-[420px] max-w-full max-md:w-full max-md:shadow-elevation-5"
              fixedWorkspaceName={workspaceId}
              onConfirm={async (documentIds) => {
                await onPasteDocuments(contextPath, documentIds)
                setPickDocsOpen(false)
              }}
              onClose={() => setPickDocsOpen(false)}
            />
          </div>
        </>,
        window.document.body,
      )}

      <ObjectPropertiesModal
        document={detailModal?.document ?? null}
        isOpen={!!detailModal}
        onClose={() => setDetailModal(null)}
        workspaceId={workspaceId}
        initialEdit={detailModal?.edit}
      />
    </div>
  )
}

export default DocumentList
