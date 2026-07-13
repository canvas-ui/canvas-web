import { useCallback, useEffect, useState } from 'react'
import { Table } from 'lucide-react'
import { registerWidget } from '../widget-registry'
import type { WidgetProps } from '../widget-types'
import { DocumentList } from '@/components/common/document-list'
import type { Document } from '@/types/workspace'
import { TimelineSortControl, DEFAULT_TIMELINE_SORT, type TimelineSort } from './sort-control'

// The "default" widget: the canvas path's documents in any of the three view
// modes (table / grid-tile / card), with timeline sort and scoped server
// search. Reuses the same DocumentList the standard folder view renders.
function DocumentsTableWidget({ config, canvas }: WidgetProps) {
  const pageSize = typeof config.pageSize === 'number' ? config.pageSize : 50
  const initialView = (config.viewMode === 'card' || config.viewMode === 'tile' || config.viewMode === 'table')
    ? config.viewMode
    : 'table'
  const [documents, setDocuments] = useState<Document[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [sort, setSort] = useState<TimelineSort>(DEFAULT_TIMELINE_SORT)
  // Single free-text term only — never a spec — so canvas search stays scoped
  // to the path server-side (see WidgetFetchOpts).
  const [activeQuery, setActiveQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await canvas.fetchDocuments({
          limit: pageSize,
          page: currentPage,
          sortBy: sort.sortBy,
          order: sort.order,
          q: activeQuery || undefined,
        })
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
  }, [canvas, pageSize, currentPage, sort.sortBy, sort.order, activeQuery])

  const changeSort = useCallback((next: TimelineSort) => { setSort(next); setCurrentPage(1) }, [])
  const runSearch = useCallback((q: string) => { setActiveQuery(q.trim()); setCurrentPage(1) }, [])
  const clearSearch = useCallback(() => { setActiveQuery(''); setCurrentPage(1) }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="canvas-no-drag flex items-center gap-2 border-b px-1 pb-2">
        <span className="text-xs text-muted-foreground">Sort</span>
        <TimelineSortControl workspaceId={canvas.workspaceId} value={sort} onChange={changeSort} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <DocumentList
          documents={documents}
          isLoading={isLoading}
          contextPath={canvas.path}
          treeName={canvas.treeName}
          workspaceId={canvas.workspaceId}
          totalCount={totalCount}
          viewMode={initialView}
          allowViewToggle
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          backendSearchQueries={activeQuery ? [activeQuery] : []}
          onBackendSearch={runSearch}
          onRemoveBackendQuery={clearSearch}
        />
      </div>
    </div>
  )
}

registerWidget({
  type: 'documents-table',
  name: 'Documents',
  icon: Table,
  defaultSize: { w: 8, h: 6, minW: 4, minH: 3 },
  defaultConfig: { pageSize: 50, viewMode: 'table' },
  component: DocumentsTableWidget,
})
