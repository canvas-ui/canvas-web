import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useAlwaysOnReader } from '@/lib/always-on-reader'
import { useReaderWidth } from '@/lib/reader-width'
import { useIsMobile } from '@/hooks/use-mobile'
import { DocumentSideCard } from '@/components/shell/DocumentSideCard'
import { ReaderResizeHandle } from '@/components/shell/ReaderResizeHandle'
import { SideViewContext, useSideView, type SideViewContextValue } from '@/components/shell/use-side-view'
import type { Document } from '@/types/workspace'

interface Props {
  enabled?: boolean
  workspaceId?: string
  scope: string
  documents: Document[]
  loading: boolean
  children: ReactNode
}

export function DocumentReadingLayout(props: Props) {
  const alwaysOn = useAlwaysOnReader()
  const mobile = useIsMobile()
  const parent = useSideView()
  // Explicit document permalinks retain their URL-backed reader and tabs.
  if (!props.enabled || !props.workspaceId || !alwaysOn || mobile || parent.location) return props.children
  return <ReadingLayout key={props.scope} {...props} workspaceId={props.workspaceId} />
}

function ReadingLayout({ workspaceId, scope, documents, loading, children }: Props & { workspaceId: string }) {
  const width = useReaderWidth()
  const storageKey = `canvas:readerSelection:${scope}`
  const [selected, setSelected] = useState<number | null>(() => {
    try { return Number(sessionStorage.getItem(storageKey)) || null } catch { return null }
  })
  const document = loading ? null : documents.find(item => item.id === selected) ?? documents[0] ?? null
  const open = useCallback((item: Document, workspace: string) => {
    if (workspace !== workspaceId) return
    setSelected(item.id)
    try { sessionStorage.setItem(storageKey, String(item.id)) } catch { /* Keep selection in memory. */ }
  }, [workspaceId, storageKey])
  const value = useMemo<SideViewContextValue>(() => ({
    entry: document ? { document, workspaceId } : null,
    alwaysOn: true, open, preview: open, replace: open, close: () => {},
  }), [document, workspaceId, open])
  return <SideViewContext.Provider value={value}>
    <div data-always-reader className="flex h-full min-h-0 min-w-0 flex-1 gap-shell">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
      <aside data-reader-pane aria-label="Document reading pane"
        style={{ width: width ? `${width}px` : '50vw', maxWidth: 'calc(100% - 240px)' } as CSSProperties}
        className="relative flex min-h-0 min-w-0 shrink-0 overflow-hidden border-l bg-card">
        <ReaderResizeHandle edge="left" />
        {document ? <DocumentSideCard key={`${workspaceId}:${document.id}`} /> :
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground" role="status">
            {loading ? 'Loading documents…' : 'No documents in this list'}
          </div>}
      </aside>
    </div>
  </SideViewContext.Provider>
}
