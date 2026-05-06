import { LayoutDashboard, BookMarked, Share2, Unlink } from 'lucide-react'
import { Document } from '@/types/workspace'
import { DocumentList } from '@/components/common/document-list'

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
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
  onImportDocuments?: (documents: any[], contextPath: string) => Promise<boolean>
  pastedDocumentIds?: number[]
  onPurgeDocuments?: () => void
  disablePurgeDocuments?: boolean
  canvasInfo?: CanvasInfo
  onSaveAsCanvas?: () => void
  onShareCanvas?: () => void
  onUnshareCanvas?: () => void
  isSharingCanvas?: boolean
  isCanvasShared?: boolean
  backendSearchQuery?: string
  onBackendSearch?: (query: string) => void
}

export function DefaultCanvas({
  urlType,
  urlDisplay,
  contextPath,
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
  pastedDocumentIds,
  onPurgeDocuments,
  disablePurgeDocuments,
  canvasInfo,
  onSaveAsCanvas,
  onShareCanvas,
  onUnshareCanvas,
  isSharingCanvas,
  isCanvasShared,
  backendSearchQuery,
  onBackendSearch,
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
          {onShareCanvas && (
            <button
              type="button"
              onClick={onShareCanvas}
              disabled={isSharingCanvas}
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
              disabled={isSharingCanvas}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              <Unlink className="w-3 h-3" />
              Unshare
            </button>
          )}
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
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <DocumentList
          documents={documents}
          isLoading={isLoading}
          contextPath={contextPath}
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
          pastedDocumentIds={pastedDocumentIds}
          onPurgeDocuments={onPurgeDocuments}
          disablePurgeDocuments={disablePurgeDocuments}
          backendSearchQuery={backendSearchQuery}
          onBackendSearch={onBackendSearch}
        />
      </div>
    </div>
  )
}
