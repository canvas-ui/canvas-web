import { useEffect, useState } from 'react'
import { Table } from 'lucide-react'
import { registerWidget } from '../widget-registry'
import type { WidgetProps } from '../widget-types'
import { DocumentList } from '@/components/common/document-list'
import type { Document } from '@/types/workspace'

// The "default" widget: a table view of all documents on the canvas' path,
// reusing the same DocumentList the standard folder view renders.
function DocumentsTableWidget({ config, canvas }: WidgetProps) {
  const pageSize = typeof config.pageSize === 'number' ? config.pageSize : 50
  const [documents, setDocuments] = useState<Document[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await canvas.fetchDocuments({ limit: pageSize, page: currentPage })
        if (cancelled) return
        setDocuments(res.payload || [])
        setTotalCount(res.totalCount || res.count || 0)
      } catch {
        if (!cancelled) { setDocuments([]); setTotalCount(0) }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [canvas, pageSize, currentPage])

  return (
    <DocumentList
      documents={documents}
      isLoading={isLoading}
      contextPath={canvas.path}
      treeName={canvas.treeName}
      workspaceId={canvas.workspaceId}
      totalCount={totalCount}
      viewMode="table"
      currentPage={currentPage}
      pageSize={pageSize}
      onPageChange={setCurrentPage}
    />
  )
}

registerWidget({
  type: 'documents-table',
  name: 'Documents (table)',
  icon: Table,
  defaultSize: { w: 8, h: 6, minW: 4, minH: 3 },
  defaultConfig: { pageSize: 50 },
  component: DocumentsTableWidget,
})
