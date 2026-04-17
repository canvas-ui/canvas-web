import { Document } from '@/types/workspace'
import { DocumentList } from '@/components/common/document-list'

type CanvasUrlType = 'context' | 'directory' | 'context-layer' | 'directory-layer'

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
  onRemoveDocuments?: (documentIds: number[]) => void
  onDeleteDocuments?: (documentIds: number[]) => void
  onCopyDocuments?: (documentIds: number[]) => void
  onCutDocuments?: (documentIds: number[]) => void
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
  onImportDocuments?: (documents: any[], contextPath: string) => Promise<boolean>
  pastedDocumentIds?: number[]
  onPurgeDocuments?: () => void
  disablePurgeDocuments?: boolean
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
  onRemoveDocuments,
  onDeleteDocuments,
  onCopyDocuments,
  onCutDocuments,
  onPasteDocuments,
  onImportDocuments,
  pastedDocumentIds,
  onPurgeDocuments,
  disablePurgeDocuments,
}: DefaultCanvasProps) {
  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/20 shrink-0">
        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted border text-muted-foreground shrink-0">
          [{urlType.replace('-', ':')}]
        </span>
        <span className="text-sm text-foreground truncate">{urlDisplay}</span>
      </div>

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
          onRemoveDocuments={onRemoveDocuments}
          onDeleteDocuments={onDeleteDocuments}
          onCopyDocuments={onCopyDocuments}
          onCutDocuments={onCutDocuments}
          onPasteDocuments={onPasteDocuments}
          onImportDocuments={onImportDocuments}
          pastedDocumentIds={pastedDocumentIds}
          onPurgeDocuments={onPurgeDocuments}
          disablePurgeDocuments={disablePurgeDocuments}
        />
      </div>
    </div>
  )
}
