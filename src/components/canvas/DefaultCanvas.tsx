import type { ReactNode } from 'react'
import { LayoutDashboard, BookMarked, Share2, Unlink, Save, Trash2, Plus, Link2 } from 'lucide-react'
import { Document, TreeNode } from '@/types/workspace'
import { DocumentList } from '@/components/common/document-list'
import type { DocumentPasteOptions } from '@/components/common/document-list'
import { useToolbox } from '@/components/toolbox/toolbox-context'

// Right-most round "+" in the content header — opens the side AddPanel picker so
// a note/link/file is created at the path shown in the URL bar.
function AddButton() {
  const { openAddPicker } = useToolbox()
  return (
    <button
      type="button"
      onClick={openAddPicker}
      title="Add a note, link or file here"
      aria-label="Add"
      className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity"
    >
      <Plus className="w-4 h-4" />
    </button>
  )
}

// Appears beside the + button whenever documents are selected — one tap to
// link the current selection somewhere else (fires an event the DocumentList
// below listens for, since it owns selection + the LinkTo modal).
function LinkSelectionButton({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('workspace:documents:link-selection'))}
      title={`Link ${count} selected document(s) to…`}
      aria-label="Link selection"
      className="shrink-0 flex items-center justify-center gap-1 h-7 min-w-7 rounded-full bg-blue-600 px-1.5 text-white hover:bg-blue-500 transition-colors"
    >
      <Link2 className="w-3.5 h-3.5" />
      <span className="text-[11px] font-semibold leading-none">{count}</span>
    </button>
  )
}

type CanvasUrlType = 'context' | 'canvas' | 'directory' | 'context-layer' | 'directory-layer'

export interface CanvasInfo {
  label?: string
  description?: string
  color?: string | null
}

interface DefaultCanvasProps {
  urlType: CanvasUrlType
  urlDisplay: string
  contextPath: string
  treeName?: string
  workspaceId?: string
  documents: Document[]
  isLoading: boolean
  totalCount: number
  currentPage: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
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
  onPurgeDocuments?: () => void
  disablePurgeDocuments?: boolean
  canvasInfo?: CanvasInfo
  onSaveAsCanvas?: () => void
  selectedCount?: number
  onShareCanvas?: () => void
  onUnshareCanvas?: () => void
  onDeleteCanvas?: () => void
  isSharingCanvas?: boolean
  isDeletingCanvas?: boolean
  isCanvasShared?: boolean
  isCanvasLocked?: boolean
  backendSearchQueries?: string[]
  onBackendSearch?: (query: string) => void
  onRemoveBackendQuery?: (index: number) => void
  serverSort?: import('@/types/workspace').ToolboxSort
  onServerSortChange?: (sort: import('@/types/workspace').ToolboxSort) => void
  scope?: 'path' | 'workspace'
  onScopeChange?: (scope: 'path' | 'workspace') => void
  canSaveChanges?: boolean
  isSavingChanges?: boolean
  onSaveChanges?: () => Promise<void> | void
  // Makes the header URL tappable — e.g. the mobile context page opens the
  // workspace tree drawer from it so the URL can be navigated by touch.
  onUrlClick?: () => void
  // When provided, enables the document list's "Link to…" path picker.
  linkTree?: TreeNode | null
  // When provided, replaces the document list body (e.g. the canvas widget grid)
  // while keeping the canvas header and its share/delete controls.
  children?: ReactNode
}

export function DefaultCanvas({
  urlType,
  urlDisplay,
  contextPath,
  treeName,
  workspaceId,
  documents,
  isLoading,
  totalCount,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onRemoveDocument,
  onDeleteDocument,
  onDestroyDocument,
  onRemoveDocuments,
  onDeleteDocuments,
  onDestroyDocuments,
  onCopyDocuments,
  onCutDocuments,
  onPasteDocuments,
  onImportDocuments,
  onSelectionChange,
  pastedDocumentIds,
  onPurgeDocuments,
  disablePurgeDocuments,
  canvasInfo,
  onSaveAsCanvas,
  onShareCanvas,
  onUnshareCanvas,
  onDeleteCanvas,
  isSharingCanvas,
  isDeletingCanvas,
  isCanvasShared,
  isCanvasLocked,
  backendSearchQueries,
  onBackendSearch,
  onRemoveBackendQuery,
  serverSort,
  onServerSortChange,
  scope,
  onScopeChange,
  canSaveChanges,
  isSavingChanges,
  onSaveChanges,
  onUrlClick,
  linkTree,
  selectedCount = 0,
  children,
}: DefaultCanvasProps) {
  const isCanvas = urlType === 'canvas'

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      {isCanvas && canvasInfo ? (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/20 shrink-0 min-w-0">
          {canvasInfo.color && (
            <div
              className="w-1 h-6 rounded-full shrink-0"
              style={{ backgroundColor: canvasInfo.color }}
            />
          )}
          <LayoutDashboard className="w-4 h-4 shrink-0 text-violet-500" />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-lg font-semibold leading-tight truncate">
              {canvasInfo.label || urlDisplay.split('://')[1] || 'Canvas'}
            </span>
            {canvasInfo.description && (
              <span className="text-xs text-muted-foreground truncate leading-tight">
                {canvasInfo.description}
              </span>
            )}
          </div>
          {canSaveChanges && onSaveChanges && (
            <button
              type="button"
              onClick={onSaveChanges}
              disabled={isSavingChanges}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Save className="w-3 h-3" />
              {isSavingChanges ? 'Saving...' : 'Save canvas'}
            </button>
          )}
          {onShareCanvas && (
            <button
              type="button"
              onClick={onShareCanvas}
              disabled={isSharingCanvas || isDeletingCanvas}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Share2 className="w-3 h-3" />
              {isSharingCanvas ? 'Sharing...' : isCanvasShared ? 'Copy link' : 'Share'}
            </button>
          )}
          {isCanvasShared && onUnshareCanvas && (
            <button
              type="button"
              onClick={onUnshareCanvas}
              disabled={isSharingCanvas || isDeletingCanvas}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              <Unlink className="w-3 h-3" />
              Unshare
            </button>
          )}
          {onDeleteCanvas && (
            <button
              type="button"
              onClick={onDeleteCanvas}
              disabled={isDeletingCanvas || (isCanvasLocked && !isCanvasShared)}
              title={isCanvasLocked && !isCanvasShared ? 'Unlock this canvas before deleting it' : 'Delete canvas'}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              {isDeletingCanvas ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <LinkSelectionButton count={selectedCount} />
          <AddButton />
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/20 shrink-0">
          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted border text-muted-foreground shrink-0">
            [{urlType.replace('-', ':')}]
          </span>
          {onUrlClick ? (
            <button
              type="button"
              onClick={onUrlClick}
              title="Browse tree"
              className="flex-1 truncate rounded px-1 -mx-1 text-left text-sm text-foreground transition-colors hover:bg-accent active:bg-accent"
            >
              {urlDisplay}
            </button>
          ) : (
            <span className="text-sm text-foreground truncate flex-1">{urlDisplay}</span>
          )}
          {onSaveAsCanvas && (
            <button
              type="button"
              onClick={onSaveAsCanvas}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            >
              <BookMarked className="w-3 h-3" />
              Save as canvas
            </button>
          )}
          <LinkSelectionButton count={selectedCount} />
          <AddButton />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {children || (
        <DocumentList
          documents={documents}
          isLoading={isLoading}
          contextPath={contextPath}
          treeName={treeName}
          workspaceId={workspaceId}
          totalCount={totalCount}
          viewMode="table"
          allowViewToggle
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          onRemoveDocument={onRemoveDocument}
          onDeleteDocument={onDeleteDocument}
          onDestroyDocument={onDestroyDocument}
          onRemoveDocuments={onRemoveDocuments}
          onDeleteDocuments={onDeleteDocuments}
          onDestroyDocuments={onDestroyDocuments}
          onCopyDocuments={onCopyDocuments}
          onCutDocuments={onCutDocuments}
          onPasteDocuments={onPasteDocuments}
          onImportDocuments={onImportDocuments}
          onSelectionChange={onSelectionChange}
          pastedDocumentIds={pastedDocumentIds}
          onPurgeDocuments={onPurgeDocuments}
          disablePurgeDocuments={disablePurgeDocuments}
          backendSearchQueries={backendSearchQueries}
          onBackendSearch={onBackendSearch}
          serverSort={serverSort}
          onServerSortChange={onServerSortChange}
          onRemoveBackendQuery={onRemoveBackendQuery}
          scope={scope}
          onScopeChange={onScopeChange}
          canSaveChanges={!isCanvas && canSaveChanges}
          isSavingChanges={isSavingChanges}
          onSaveChanges={onSaveChanges}
          linkTree={linkTree}
        />
        )}
      </div>
    </div>
  )
}
