import type { ReactNode } from 'react'
import { LayoutDashboard, BookMarked, Share2, Unlink, Save, Trash2, Plus } from 'lucide-react'
import { Document, TreeNode } from '@/types/workspace'
import { DocumentList } from '@/components/common/document-list'
import type { DocumentPasteOptions } from '@/components/common/document-list'
import { useToolbox } from '@/components/toolbox/toolbox-context'

// Right-most "+ Add" in the content header — opens the side AddPanel picker so a
// note/link/file is created at the path shown in the URL bar.
function AddButton() {
  const { openAddPicker } = useToolbox()
  return (
    <button
      type="button"
      onClick={openAddPicker}
      title="Add a note, link or file here"
      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
    >
      <Plus className="w-3 h-3" />
      Add
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
  onShareCanvas?: () => void
  onUnshareCanvas?: () => void
  onDeleteCanvas?: () => void
  isSharingCanvas?: boolean
  isDeletingCanvas?: boolean
  isCanvasShared?: boolean
  isCanvasLocked?: boolean
  backendSearchQuery?: string
  onBackendSearch?: (query: string) => void
  canSaveChanges?: boolean
  isSavingChanges?: boolean
  onSaveChanges?: () => Promise<void> | void
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
  backendSearchQuery,
  onBackendSearch,
  canSaveChanges,
  isSavingChanges,
  onSaveChanges,
  linkTree,
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
          <AddButton />
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/20 shrink-0">
          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted border text-muted-foreground shrink-0">
            [{urlType.replace('-', ':')}]
          </span>
          <span className="text-sm text-foreground truncate flex-1">{urlDisplay}</span>
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
          backendSearchQuery={backendSearchQuery}
          onBackendSearch={onBackendSearch}
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
