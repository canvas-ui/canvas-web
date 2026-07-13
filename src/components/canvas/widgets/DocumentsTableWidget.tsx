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
  // View order is a canvas-level property (bakes into querySpec on Save), not
  // widget-local — so changing it here and saving sorts the public canvas too.
  const sort = canvas.canvasSort ?? DEFAULT_TIMELINE_SORT
  // Free-text terms only — never a spec — so canvas search stays scoped to
  // the path server-side (see WidgetFetchOpts). A stack: each submitted term
  // refines (narrows) the previous result set; the last one ranks.
  const [activeQueries, setActiveQueries] = useState<string[]>([])

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
          queries: activeQueries.length ? activeQueries : undefined,
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
  }, [canvas, pageSize, currentPage, sort.sortBy, sort.order, activeQueries])

  const changeSort = useCallback((next: TimelineSort) => { canvas.setCanvasSort?.(next); setCurrentPage(1) }, [canvas])
  const runSearch = useCallback((q: string) => {
    const term = q.trim()
    if (!term) return
    setActiveQueries((prev) => (prev.includes(term) ? prev : [...prev, term]))
    setCurrentPage(1)
  }, [])
  // index -1 = clear the whole stack (DocumentList convention).
  const removeQuery = useCallback((index: number) => {
    setActiveQueries((prev) => (index < 0 ? [] : prev.filter((_, i) => i !== index)))
    setCurrentPage(1)
  }, [])

  // Read-only public shares are a preloaded snapshot: server sort/search are
  // inert, and the sort control's timelines fetch hits an authed endpoint
  // (401 → login bounce). Drop the interactive bits on read-only.
  const readOnly = canvas.readOnly === true

  return (
    <div className="flex h-full flex-col">
      {!readOnly && (
        <div className="canvas-no-drag flex items-center gap-2 border-b px-1 pb-2">
          <span className="text-xs text-muted-foreground">Sort</span>
          <TimelineSortControl workspaceId={canvas.workspaceId} value={sort} onChange={changeSort} />
        </div>
      )}
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
          backendSearchQueries={activeQueries}
          onBackendSearch={readOnly ? undefined : runSearch}
          onRemoveBackendQuery={readOnly ? undefined : removeQuery}
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
