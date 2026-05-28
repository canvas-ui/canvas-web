import { useEffect, useState } from 'react'
import { Document } from '@/types/workspace'
import { downloadDocument, fetchDocumentBlob } from '@/services/workspace'
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

// Any file doc gets the preview component — binary types just show a
// "no inline preview" notice plus the Download button.
export function isPreviewable(document: Document): boolean {
  return document.schema === FILE_SCHEMA
}

export function FilePreview({ workspaceId, document }: FilePreviewProps) {
  const declaredMime = String(document.data?.mime || document.metadata?.contentType || 'application/octet-stream')
  const kind = classify(declaredMime)
  const filename = String(document.data?.filename || `document-${document.id}`)

  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    setError(null)
    setBlobUrl(null)
    setText(null)

    if (kind === 'binary') return

    fetchDocumentBlob(workspaceId, document.id)
      .then(async ({ blob }) => {
        if (cancelled) return
        if (kind === 'text') {
          // Read directly from the Blob — fetch(blob:…) trips CSP connect-src.
          const txt = await blob.text()
          if (!cancelled) setText(txt.slice(0, 200_000))
        } else {
          createdUrl = URL.createObjectURL(blob)
          if (cancelled) { URL.revokeObjectURL(createdUrl); createdUrl = null; return }
          setBlobUrl(createdUrl)
        }
      })
      .catch((e) => { if (!cancelled) setError(String(e.message || e)) })

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [workspaceId, document.id, kind])

  const onDownload = async () => {
    try { await downloadDocument(workspaceId, document.id, filename) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{declaredMime}</span>
        <button onClick={onDownload} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          <Download className="h-3 w-3" /> Download
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && kind !== 'binary' && kind !== 'text' && !blobUrl && <p className="text-sm text-muted-foreground">Loading preview...</p>}
      {!error && kind === 'image' && blobUrl && <img src={blobUrl} alt={filename} className="max-h-[60vh] max-w-full border rounded" />}
      {!error && kind === 'audio' && blobUrl && <audio src={blobUrl} controls className="w-full" />}
      {!error && kind === 'video' && blobUrl && <video src={blobUrl} controls className="max-h-[60vh] w-full" />}
      {!error && kind === 'pdf'   && blobUrl && <iframe src={blobUrl} className="w-full h-[60vh] border rounded" title={filename} />}
      {!error && kind === 'text' && (
        text == null ? <p className="text-sm text-muted-foreground">Loading...</p>
                     : <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-[60vh] whitespace-pre-wrap">{text}</pre>
      )}
      {!error && kind === 'binary' && <p className="text-sm text-muted-foreground">No inline preview available for this type — use Download.</p>}
    </div>
  )
}

export default FilePreview
