import { useDocumentBlobUrl } from './useDocumentBlobUrl'
import { getLocationFilename } from '@/lib/document-display'
import type { RendererProps } from './types'

// Small blob-backed media renderers. Kept together — they share the exact
// fetch/loading/error skeleton and differ only in the final element.

function MediaShell({ error, loading, children }: { error: string | null; loading: boolean; children: React.ReactNode }) {
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (loading) return <p className="text-sm text-muted-foreground">Loading preview...</p>
  return <>{children}</>
}

export function ImageRenderer({ workspaceId, document, className = '' }: RendererProps) {
  const { blobUrl, error, loading } = useDocumentBlobUrl(workspaceId, document.id)
  const filename = getLocationFilename(document) || `document-${document.id}`
  return (
    <MediaShell error={error} loading={loading}>
      {blobUrl && <img src={blobUrl} alt={filename} className={`max-h-[70vh] max-w-full border rounded ${className}`} />}
    </MediaShell>
  )
}

export function AudioRenderer({ workspaceId, document, className = '' }: RendererProps) {
  const { blobUrl, error, loading } = useDocumentBlobUrl(workspaceId, document.id)
  return (
    <MediaShell error={error} loading={loading}>
      {blobUrl && <audio src={blobUrl} controls className={`w-full ${className}`} />}
    </MediaShell>
  )
}

export function VideoRenderer({ workspaceId, document, className = '' }: RendererProps) {
  const { blobUrl, error, loading } = useDocumentBlobUrl(workspaceId, document.id)
  return (
    <MediaShell error={error} loading={loading}>
      {blobUrl && <video src={blobUrl} controls className={`max-h-[70vh] w-full ${className}`} />}
    </MediaShell>
  )
}

export function PdfRenderer({ workspaceId, document, className = '' }: RendererProps) {
  const { blobUrl, error, loading } = useDocumentBlobUrl(workspaceId, document.id)
  const filename = getLocationFilename(document) || `document-${document.id}`
  return (
    <MediaShell error={error} loading={loading}>
      {blobUrl && <iframe src={blobUrl} className={`w-full h-[70vh] border rounded ${className}`} title={filename} />}
    </MediaShell>
  )
}
