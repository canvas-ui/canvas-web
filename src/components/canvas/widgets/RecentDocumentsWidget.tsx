import { useEffect, useState } from 'react'
import { FileStack } from 'lucide-react'
import { registerWidget } from '../widget-registry'
import type { WidgetProps } from '../widget-types'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import type { Document } from '@/types/workspace'

function RecentDocumentsWidget({ config, canvas }: WidgetProps) {
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
      {documents.map((doc) => {
        const display = getDocumentDisplayInfo(doc)
        return (
          <li key={doc.id} className="py-1.5 min-w-0">
            <div className="truncate font-medium">{display.title}</div>
            {display.preview && (
              <div className="truncate text-xs text-muted-foreground">{display.preview}</div>
            )}
          </li>
        )
      })}
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
