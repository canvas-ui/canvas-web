import type { ReactNode } from 'react'
import { TreeBreadcrumbs } from '@/components/common/tree-breadcrumbs'
import { treeBreadcrumbs } from '@/lib/tree-breadcrumbs'
import { LayoutDashboard, BookMarked, Share2, Unlink, Save, Trash2, Plus, Link2, FolderTree, Pin, PinOff } from 'lucide-react'
import { Document, TreeNode } from '@/types/workspace'
import { DocumentList, type FolderEntry } from '@/components/common/document-list'
import type { DocumentPasteOptions } from '@/components/common/document-list'
import { useToolbox } from '@/components/toolbox/use-toolbox'

// Right-most round "+" in the content header — opens the side AddPanel picker so
// a note/link/file is created at the path shown in the breadcrumbs.
function AddButton() {
  const { openAddPicker } = useToolbox()
  return (
    <button
      type="button"
      onClick={openAddPicker}
      title="Add here"
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
      className="shrink-0 flex items-center justify-center gap-1 h-7 min-w-7 rounded-full bg-info px-1.5 text-info-foreground hover:bg-info transition-colors touch-target"
    >
      <Link2 className="w-3.5 h-3.5" />
      <span className="text-[11px] font-semibold leading-none">{count}</span>
    </button>
  )
}

// The chip shows the ACTUAL tree name — 'backends' (or a custom tree) rather
// than its generic 'directory' type — so `(string & {})` admits any tree name
// while keeping autocomplete for the well-known ones.
type CanvasUrlType = 'context' | 'canvas' | 'directory' | 'backends' | 'context-layer' | 'directory-layer' | (string & {})

// Shared by workspace, context, canvas, and split-pane content headers.
function PathBar({
  treeName, path, rootLabel, onBrowseTree, onNavigatePath,
}: {
  treeName: string
  path: string
  rootLabel: string
  onBrowseTree?: () => void
  onNavigatePath?: (path: string) => void
}) {
  const chip = <span className="font-mono text-xs text-muted-foreground">[{treeName}]</span>
  return (
    <div className="flex min-h-9 min-w-0 flex-1 items-center gap-2">
      {onBrowseTree ? (
        <button type="button" onClick={onBrowseTree} title="Browse tree" aria-label="Browse tree"
          className="flex shrink-0 items-center gap-1 rounded border bg-muted px-1.5 py-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />{chip}
        </button>
      ) : <span className="shrink-0 rounded border bg-muted px-1.5 py-1">{chip}</span>}
      <TreeBreadcrumbs items={treeBreadcrumbs(path, rootLabel)} onNavigate={onNavigatePath} />
    </div>
  )
}

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
  onImportDocuments?: (documents: Record<string, unknown>[], contextPath: string) => Promise<boolean>
  onSelectionChange?: (documentIds: number[]) => void
  pastedDocumentIds?: number[]
  onPurgeDocuments?: () => void
  disablePurgeDocuments?: boolean
  canvasInfo?: CanvasInfo
  // Pin this canvas to /home. Only wired for real canvases; undefined hides it.
  isCanvasPinned?: boolean
  onTogglePinCanvas?: () => void
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
  // The tree chip opens the full tree; breadcrumbs navigate to ancestors.
  onBrowseTree?: () => void
  onNavigatePath?: (path: string) => void
  // When provided, enables the document list's "Link to…" path picker.
  linkTree?: TreeNode | null
  // When provided, replaces the document list body (e.g. the canvas widget grid)
  // while keeping the canvas header and its share/delete controls.
  children?: ReactNode
  /**
   * Rendered above the content, whether that content is the document list or a
   * canvas grid. Separate from `children` on purpose: children REPLACE the
   * document list, so anything meant to sit beside it belongs here.
   */
  contentBanner?: ReactNode
  // Directory-tree folders shown above the documents (file-manager style).
  folders?: FolderEntry[]
  onOpenFolder?: (path: string) => void
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
  isCanvasPinned,
  onTogglePinCanvas,
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
  onBrowseTree,
  onNavigatePath,
  linkTree,
  selectedCount = 0,
  children,
  contentBanner,
  folders,
  onOpenFolder,
}: DefaultCanvasProps) {
  const isCanvas = urlType === 'canvas'
  const pathBar = <PathBar
    treeName={treeName ? `${treeName}${urlType.endsWith('-layer') ? ':layer' : ''}` : urlType.replace('-', ':')}
    path={contextPath}
    rootLabel={workspaceId || urlDisplay.split('://')[0] || 'Workspace'}
    onBrowseTree={onBrowseTree}
    onNavigatePath={onNavigatePath}
  />

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      {isCanvas && canvasInfo ? (
        <>
        <div className="flex min-w-0 shrink-0 items-center border-b bg-muted/20 px-4 py-1">{pathBar}</div>
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/20 shrink-0 min-w-0">
          {canvasInfo.color && (
            <div
              className="w-1 h-6 rounded-full shrink-0"
              style={{ backgroundColor: canvasInfo.color }}
            />
          )}
          <LayoutDashboard className="w-4 h-4 shrink-0 text-primary" />
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
              title="Save filters"
            >
              <Save className="w-3 h-3" />
              <span className="hidden sm:inline">{isSavingChanges ? 'Saving...' : 'Save filters'}</span>
            </button>
          )}
          {onTogglePinCanvas && (
            <button
              type="button"
              onClick={onTogglePinCanvas}
              aria-pressed={!!isCanvasPinned}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title={isCanvasPinned ? 'Unpin from home' : 'Pin to home'}
            >
              {isCanvasPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
              <span className="hidden sm:inline">{isCanvasPinned ? 'Unpin' : 'Pin'}</span>
            </button>
          )}
          {onShareCanvas && (
            <button
              type="button"
              onClick={onShareCanvas}
              disabled={isSharingCanvas || isDeletingCanvas}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
              title={isCanvasShared ? 'Copy public link' : 'Share canvas'}
            >
              <Share2 className="w-3 h-3" />
              <span className="hidden sm:inline">{isSharingCanvas ? 'Sharing...' : isCanvasShared ? 'Copy link' : 'Share'}</span>
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
              <span className="hidden sm:inline">Unshare</span>
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
              <span className="hidden sm:inline">{isDeletingCanvas ? 'Deleting…' : 'Delete'}</span>
            </button>
          )}
          <LinkSelectionButton count={selectedCount} />
          <AddButton />
        </div>
        </>
      ) : (
        <div className="flex min-w-0 items-center gap-2 px-4 py-2.5 border-b bg-muted/20 shrink-0">
          {pathBar}
          {onSaveAsCanvas && (
            <button
              type="button"
              onClick={onSaveAsCanvas}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title="Save as canvas"
            >
              <BookMarked className="w-3 h-3" />
              <span className="hidden sm:inline">Save as canvas</span>
            </button>
          )}
          <LinkSelectionButton count={selectedCount} />
          <AddButton />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {contentBanner}
        {/* ⚠️ `children ||` means ANY children replace the document list — and an
            array of children is truthy even when every element is false. Never
            add a second child here to show something ALONGSIDE the list; use
            contentBanner, which is what it is for. */}
        {children || (
        <DocumentList
          documents={documents}
          isLoading={isLoading}
          folders={folders}
          onOpenFolder={onOpenFolder}
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
