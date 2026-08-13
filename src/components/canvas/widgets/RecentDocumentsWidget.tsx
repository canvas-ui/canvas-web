import { useEffect, useState } from 'react'
import { FileStack } from 'lucide-react'
import { registerWidget } from '../widget-registry'
import type { WidgetProps } from '../widget-types'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import type { Document } from '@/types/workspace'
import { useDocumentActivation } from '../useDocumentActivation'

// A single recent-document line. Click / tap / long-press opens the shared
// document modal (the full view/edit controls) — the widget is a shortcut, not
// a dead-end view. No-op on the public share (no modal provider).
export function RecentDocRow({ doc, workspaceId }: { doc: Document; workspaceId: string }) {
  const display = getDocumentDisplayInfo(doc)
  const { activationProps } = useDocumentActivation(doc, workspaceId)
  return (
    <li
      {...activationProps}
      title="Open details"
      className="canvas-no-drag cursor-pointer py-1.5 min-w-0 rounded px-1 transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="truncate font-medium">{display.title}</div>
      {display.preview && (
        <div className="truncate text-xs text-muted-foreground">{display.preview}</div>
      )}
    </li>
  )
}

export function RecentDocumentsWidget({ config, canvas }: WidgetProps) {
  const limit = typeof config.limit === 'number' ? config.limit : 10
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await canvas.fetchDocuments({ limit })
        if (cancelled) return
        setDocuments(res.payload || [])
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load documents')
        setDocuments([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [canvas, limit])

  if (isLoading) return <div className="text-xs text-muted-foreground p-1">Loading…</div>
  if (error) return <div className="text-xs text-destructive p-1">{error}</div>
  if (documents.length === 0) return <div className="text-xs text-muted-foreground p-1">No documents on this canvas.</div>

  return (
    <ul className="divide-y text-sm">
      {documents.map((doc) => (
        <RecentDocRow key={doc.id} doc={doc} workspaceId={canvas.workspaceId} />
      ))}
    </ul>
  )
}

registerWidget({
  type: 'recent-documents',
  name: 'Recent documents',
  icon: FileStack,
  defaultSize: { w: 4, h: 4, minW: 3, minH: 2 },
  defaultConfig: { limit: 10 },
  component: RecentDocumentsWidget,
})
