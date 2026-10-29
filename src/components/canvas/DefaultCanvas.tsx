import { FileDropArea } from './FileDropArea'
import { useState, type ReactNode } from 'react'
import { CanvasAddressBar, CanvasTabStrip } from '@/components/common/canvas-address-bar'
import { LayoutDashboard, BookMarked, Share2, Unlink, Save, Trash2, Pin, PinOff } from 'lucide-react'
import { Document, TreeNode } from '@/types/workspace'
import { DocumentList, type FolderEntry } from '@/components/common/document-list'
import type { DocumentPasteOptions } from '@/components/common/document-list'
import { useToolbox } from '@/components/toolbox/use-toolbox'
import { useSideView } from '@/components/shell/use-side-view'

// The chip shows the ACTUAL tree name — 'backends' (or a custom tree) rather
// than its generic 'directory' type — so `(string & {})` admits any tree name
// while keeping autocomplete for the well-known ones.
type CanvasUrlType = 'context' | 'canvas' | 'directory' | 'backends' | 'context-layer' | 'directory-layer' | (string & {})

export interface CanvasInfo {
  label?: string
  description?: string
  color?: string | null
}

interface DefaultCanvasProps {
  navigationTabs?: ReactNode
  frameContent?: boolean
  navigationActions?: ReactNode
  onBack?: () => void
  accentColor?: string | null
  urlType: CanvasUrlType
  urlDisplay: string
  contextPath: string
  treeName?: string
  workspaceId?: string
  workspaceLabel?: string
  workspaceIcon?: string | null
  /** A schema lens retains the standard list, its search and all actions. */
  documentSchema?: string
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
  // Workspace opens the workspace list; tree opens its tree; paths navigate.
  onBrowseWorkspaces?: () => void
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
  navigationTabs, navigationActions, onBack, accentColor, frameContent = true,
  urlType,
  urlDisplay,
  contextPath,
  treeName,
  workspaceId,
  workspaceLabel,
  workspaceIcon,
  documentSchema,
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
  onBrowseWorkspaces,
  onBrowseTree,
  onNavigatePath,
  linkTree,
  children,
  contentBanner,
  folders,
  onOpenFolder,
}: DefaultCanvasProps) {
  const isCanvas = urlType === 'canvas'
  const { state: toolbox, toggleView, hasActiveFilters, openAddPicker } = useToolbox()
  const sideView = useSideView()
  const [draft, setDraft] = useState('')
  const scopeKey = JSON.stringify([workspaceId, treeName, contextPath, documentSchema])
  const [previousScope, setPreviousScope] = useState(scopeKey)
  if (previousScope !== scopeKey) { setPreviousScope(scopeKey); setDraft('') }
  const listActions = <>
    {navigationActions}
    {onSaveAsCanvas && <button type="button" onClick={onSaveAsCanvas} title="Save as canvas" aria-label="Save as canvas" className="flex h-control-sm w-control-sm shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent touch-target"><BookMarked className="h-4 w-4" /></button>}
  </>

  return (
    <FileDropArea target={onImportDocuments && workspaceId ? {
      mode: 'workspace', workspaceName: workspaceId, path: contextPath,
      treeName: treeName || 'context', treeType: treeName === 'directory' ? 'directory' : 'context',
    } : null}>
      {navigationTabs && <CanvasTabStrip accentColor={accentColor}>{navigationTabs}</CanvasTabStrip>}
      <div className={`canvas-surface-body${frameContent ? ' is-framed' : ''}`}>
      <CanvasAddressBar workspaceIcon={workspaceIcon} workspace={workspaceLabel || workspaceId || urlDisplay.split('://')[0] || 'Workspace'}
        tree={treeName ? `${treeName}${urlType.endsWith('-layer') ? ':layer' : ''}` : urlType.replace('-layer', '')} path={contextPath}
        accentColor={accentColor} onBack={sideView.location
          ? sideView.location.section === 'view' ? sideView.close : () => sideView.update?.({ section: 'view' })
          : onBack}
        section={sideView.location ? `document/${sideView.location.documentId}/${sideView.location.section}` : undefined}
        onSection={sideView.location ? () => sideView.update?.({ section: 'view' }) : undefined}
        onBrowseWorkspaces={onBrowseWorkspaces} onBrowseTree={onBrowseTree} onNavigatePath={onNavigatePath}
        onFilter={() => toggleView('tools')} filtersActive={hasActiveFilters}
        filtersOpen={toolbox.t1Open && toolbox.t1View === 'tools'} onAdd={event => openAddPicker({ modal: event.shiftKey, fresh: true })}
        search={onBackendSearch || !children ? { queries: backendSearchQueries || [], onSearch: onBackendSearch ?? setDraft, localOnly: !onBackendSearch, onRemoveQuery: onRemoveBackendQuery, scope, onScopeChange } : undefined}
        onDraftChange={children ? undefined : setDraft}
      />
      {isCanvas && canvasInfo ? (
        <>
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
        </div>
        </>
      ) : null}
      {children && (onSaveAsCanvas || navigationActions) && <div className="flex items-center gap-2 border-b px-3 py-1">{listActions}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {contentBanner}
        {/* ⚠️ `children ||` means ANY children replace the document list — and an
            array of children is truthy even when every element is false. Never
            add a second child here to show something ALONGSIDE the list; use
            contentBanner, which is what it is for. */}
        {children || (
        <DocumentList
          readingPane
          key={documentSchema ?? 'documents'}
          externalSearchQuery={draft}
          toolbarActions={listActions}
          documents={documentSchema ? documents.filter(document => document.schema === documentSchema) : documents}
          isLoading={isLoading}
          folders={documentSchema ? undefined : folders}
          onOpenFolder={onOpenFolder}
          contextPath={contextPath}
          treeName={treeName}
          workspaceId={workspaceId}
          totalCount={totalCount}
          viewMode={documentSchema ? "card" : "table"}
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
          onPurgeDocuments={documentSchema ? undefined : onPurgeDocuments}
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
    </FileDropArea>
  )
}
