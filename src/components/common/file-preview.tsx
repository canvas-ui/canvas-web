import { useEffect, useState } from 'react'
import { Document } from '@/types/workspace'
import { getDocumentContentUrl } from '@/services/workspace'
import { Download } from 'lucide-react'

interface FilePreviewProps {
  workspaceId: string
  document: Document
}

const FILE_SCHEMA = 'data/abstraction/file'

function classify(mime: string): 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'binary' {
  if (!mime) return 'binary'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('text/') || mime.endsWith('+json') || mime === 'application/json' || mime === 'application/xml') return 'text'
  return 'binary'
}

export function isPreviewable(document: Document): boolean {
  if (document.schema !== FILE_SCHEMA) return false
  const mime = String(document.data?.mime || document.metadata?.contentType || '')
  return classify(mime) !== 'binary'
}

export function FilePreview({ workspaceId, document }: FilePreviewProps) {
  const mime = String(document.data?.mime || document.metadata?.contentType || 'application/octet-stream')
  const kind = classify(mime)
  const url = getDocumentContentUrl(workspaceId, document.id)
  const downloadUrl = getDocumentContentUrl(workspaceId, document.id, { download: true })
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (kind !== 'text') { setText(null); return }
    let cancelled = false
    fetch(url, { credentials: 'include' })
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(t => { if (!cancelled) setText(t.slice(0, 200_000)) })
      .catch(e => { if (!cancelled) setError(String(e.message || e)) })
    return () => { cancelled = true }
  }, [kind, url])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{mime}</span>
        <a href={downloadUrl} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          <Download className="h-3 w-3" /> Download
        </a>
      </div>
      {kind === 'image' && <img src={url} alt={document.data?.filename || 'preview'} className="max-h-[60vh] max-w-full border rounded" />}
      {kind === 'audio' && <audio src={url} controls className="w-full" />}
      {kind === 'video' && <video src={url} controls className="max-h-[60vh] w-full" />}
      {kind === 'pdf' && <iframe src={url} className="w-full h-[60vh] border rounded" title="pdf-preview" />}
      {kind === 'text' && (
        error ? <p className="text-sm text-destructive">{error}</p>
              : <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-[60vh] whitespace-pre-wrap">{text ?? 'Loading...'}</pre>
      )}
      {kind === 'binary' && <p className="text-sm text-muted-foreground">No inline preview available for this type.</p>}
    </div>
  )
}

export default FilePreview
