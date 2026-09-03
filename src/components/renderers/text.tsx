import { MarkdownView } from '@/components/common/markdown-view'
import { useDocumentBlobUrl } from './useDocumentBlobUrl'
import { NOTE_SCHEMA, type RendererProps } from './types'

// Plaintext file body — monospace card, capped at 200k chars.
export function PlaintextRenderer({ workspaceId, document, className = '' }: RendererProps) {
  const { text, error, loading } = useDocumentBlobUrl(workspaceId, document.id, { mode: 'text' })
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (loading || text == null) return <p className="text-sm text-muted-foreground">Loading...</p>
  return (
    <pre className={`bg-muted p-3 rounded text-xs overflow-auto max-h-viewport-pane whitespace-pre-wrap ${className}`}>{text}</pre>
  )
}

// Markdown — notes render their inline data.content, markdown FILES fetch the
// blob text first. Both go through the shared MarkdownView.
export function MarkdownRenderer({ workspaceId, document, className = '' }: RendererProps) {
  const isNote = document.schema === NOTE_SCHEMA
  const { text, error, loading } = useDocumentBlobUrl(workspaceId, document.id, { mode: 'text', enabled: !isNote })

  if (isNote) {
    return (
      <div className={`space-y-3 ${className}`}>
        {document.data?.title ? <h3 className="text-lg font-semibold">{String(document.data.title)}</h3> : null}
        <div className="rounded-md border border-input bg-transparent">
          <MarkdownView content={String(document.data?.content ?? '')} className="markdown-doc px-4 py-3" />
        </div>
      </div>
    )
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (loading || text == null) return <p className="text-sm text-muted-foreground">Loading...</p>
  return (
    <div className={`rounded-md border border-input bg-transparent overflow-auto max-h-viewport-pane ${className}`}>
      <MarkdownView content={text} className="markdown-doc px-4 py-3" />
    </div>
  )
}
