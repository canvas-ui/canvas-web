import { useState } from 'react'
import { Download } from 'lucide-react'
import { useDocumentBlobUrl } from './useDocumentBlobUrl'
import { useDocumentThumbnail } from './useDocumentThumbnail'
import { useDocumentContent } from './public-share'
import { getLocationFilename } from '@/lib/document-display'
import { mimeFromFilename, type RendererProps } from './types'

// Share-aware "Download original" button — hits the content endpoint with
// download=1 (Content-Disposition: attachment) via an authed fetch, so no token
// is ever placed in a URL. Shared by the media renderers.
function DownloadButton({ workspaceId, document }: RendererProps) {
  const { download } = useDocumentContent(workspaceId)
  const [busy, setBusy] = useState(false)
  const filename = getLocationFilename(document) || `document-${document.id}`
  return (
    <button
      type="button"
      onClick={async () => { setBusy(true); try { await download(document.id, filename) } finally { setBusy(false) } }}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" />
      {busy ? 'Preparing…' : 'Download'}
    </button>
  )
}

// Preview cap: a server-downscaled render (same sharp pipeline as thumbnails),
// so opening a 7MP photo no longer streams the full original — that stays one
// click away via "Download original".
const IMAGE_PREVIEW_SIZE = 1600

// Small blob-backed media renderers. Kept together — they share the exact
// fetch/loading/error skeleton and differ only in the final element.

function MediaShell({ error, loading, children }: { error: string | null; loading: boolean; children: React.ReactNode }) {
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (loading) return <p className="text-sm text-muted-foreground">Loading preview...</p>
  return <>{children}</>
}

export function ImageRenderer({ workspaceId, document: doc, className = '' }: RendererProps) {
  // Downscaled preview (falls back to full bytes only if no thumbnail exists).
  const { blobUrl, error, loading } = useDocumentThumbnail(workspaceId, doc.id, IMAGE_PREVIEW_SIZE)
  const { fetchBlob } = useDocumentContent(workspaceId)
  const filename = getLocationFilename(doc) || `document-${doc.id}`
  const [downloading, setDownloading] = useState(false)

  // Fetch the FULL original only on demand, then trigger a browser download.
  // Share-aware (fetchBlob) so it works on public canvases too.
  const downloadOriginal = async () => {
    setDownloading(true)
    try {
      const { blob } = await fetchBlob(doc.id)
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = filename
      window.document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <MediaShell error={error} loading={loading}>
      {blobUrl && (
        <div className={`space-y-2 ${className}`}>
          {/* Fill the width of the (possibly maximized) modal/preview area,
              keeping aspect via h-auto. */}
          <img src={blobUrl} alt={filename} className="w-full h-auto rounded border" />
          <button
            type="button"
            onClick={downloadOriginal}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? 'Preparing…' : 'Download original'}
          </button>
        </div>
      )}
    </MediaShell>
  )
}

export function AudioRenderer({ workspaceId, document, className = '' }: RendererProps) {
  const typeHint = mimeFromFilename(getLocationFilename(document))
  const { blobUrl, error, loading } = useDocumentBlobUrl(workspaceId, document.id, { typeHint })
  return (
    <MediaShell error={error} loading={loading}>
      {blobUrl && (
        <div className={`space-y-2 ${className}`}>
          <audio src={blobUrl} controls className="w-full" />
          <DownloadButton workspaceId={workspaceId} document={document} />
        </div>
      )}
    </MediaShell>
  )
}

export function VideoRenderer({ workspaceId, document, className = '' }: RendererProps) {
  // Give the blob a real MIME from the filename when the server sent a generic
  // one — <video> won't decode a typeless blob.
  const typeHint = mimeFromFilename(getLocationFilename(document))
  const { blobUrl, error, loading } = useDocumentBlobUrl(workspaceId, document.id, { typeHint })
  const [playError, setPlayError] = useState(false)
  return (
    <MediaShell error={error} loading={loading}>
      {blobUrl && (
        <div className={`space-y-2 ${className}`}>
          {/* playsInline is REQUIRED for inline playback on iOS / iOS-PWA.
              preload=metadata avoids buffering the whole file up front. */}
          <video
            src={blobUrl}
            controls
            playsInline
            preload="metadata"
            onError={() => setPlayError(true)}
            className="max-h-[70vh] w-full rounded border"
          />
          {playError && (
            <p className="text-xs text-muted-foreground">
              This video can’t be played inline in your browser{typeHint ? ` (${typeHint})` : ''}. Download it to view.
            </p>
          )}
          <DownloadButton workspaceId={workspaceId} document={document} />
        </div>
      )}
    </MediaShell>
  )
}

export function PdfRenderer({ workspaceId, document, className = '' }: RendererProps) {
  // Re-type a generic blob to application/pdf so the iframe viewer engages.
  const { blobUrl, error, loading } = useDocumentBlobUrl(workspaceId, document.id, { typeHint: 'application/pdf' })
  const filename = getLocationFilename(document) || `document-${document.id}`
  return (
    <MediaShell error={error} loading={loading}>
      {/* Fill the free height of the (definite-height) preview area; min-h keeps
          it usable when the host isn't height-constrained. */}
      {blobUrl && <iframe src={blobUrl} className={`w-full h-full min-h-[300px] border rounded ${className}`} title={filename} />}
    </MediaShell>
  )
}
