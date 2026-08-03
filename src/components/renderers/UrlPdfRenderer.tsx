import { useEffect, useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { API_URL } from '@/config/api'
import { PdfViewer } from './PdfViewer'
import type { RendererProps } from './types'

// Does a link/tab URL point at a PDF? Extension match plus well-known
// extensionless PDF paths (arxiv.org/pdf/<id>).
export function isPdfUrl(url: string | undefined | null): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    if (/\.pdf$/i.test(u.pathname)) return true
    if (u.hostname.endsWith('arxiv.org') && u.pathname.startsWith('/pdf/')) return true
    return false
  } catch {
    return false
  }
}

// Inline preview for remote PDF links (tab/link docs). The app CSP only
// allows blob: iframes, so the PDF is fetched client-side (connect-src allows
// https:) and framed from a blob URL. Hosts without CORS headers (arxiv.org
// among them) block the direct fetch — those are retried through the server's
// authenticated same-origin PDF proxy; only if that also fails do we fall
// back to an "open externally" notice.
export function UrlPdfRenderer({ document: doc, className = '' }: RendererProps) {
  const url = String(doc.data?.url ?? doc.data?.uri ?? '')
  const [state, setState] = useState<{ blobUrl: string | null; blob: Blob | null; failed: boolean; loading: boolean }>({ blobUrl: null, blob: null, failed: false, loading: true })
  // Render-time reset when the URL changes (no setState-in-effect).
  const [lastUrl, setLastUrl] = useState(url)
  if (url !== lastUrl) {
    setLastUrl(url)
    setState({ blobUrl: null, blob: null, failed: false, loading: true })
  }

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null

    const toTypedBlob = async (res: Response) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      return blob.type ? blob : new Blob([blob], { type: 'application/pdf' })
    }

    const viaProxy = () => {
      const token = localStorage.getItem('authToken')
      return fetch(`${API_URL}/proxy/pdf?url=${encodeURIComponent(url)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    }

    fetch(url)
      .then(toTypedBlob)
      .catch(() => viaProxy().then(toTypedBlob))
      .then((blob) => {
        if (cancelled) return
        createdUrl = URL.createObjectURL(blob)
        setState({ blobUrl: createdUrl, blob, failed: false, loading: false })
      })
      .catch(() => { if (!cancelled) setState({ blobUrl: null, blob: null, failed: true, loading: false }) })

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [url])

  const { blobUrl, blob, failed, loading } = state

  // Filename for the download: last URL path segment, .pdf-suffixed.
  const filename = (() => {
    try {
      const seg = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '')
      const base = seg || 'document'
      return /\.pdf$/i.test(base) ? base : `${base}.pdf`
    } catch {
      return 'document.pdf'
    }
  })()

  // The bytes are already in memory — save them via a transient anchor.
  const downloadPdf = () => {
    if (!blob) return
    const dlUrl = URL.createObjectURL(blob)
    const a = window.document.createElement('a')
    a.href = dlUrl
    a.download = filename
    window.document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(dlUrl), 30_000)
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <ExternalLink className="h-3 w-3" /> {url}
        </a>
        {blob && (
          <button
            type="button"
            onClick={downloadPdf}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        )}
      </div>
      {loading && <p className="text-sm text-muted-foreground">Loading PDF…</p>}
      {failed && (
        <p className="text-sm text-muted-foreground">
          Inline preview unavailable (direct fetch and server proxy both failed) — use the link above.
        </p>
      )}
      {blobUrl && <PdfViewer blob={blob} blobUrl={blobUrl} filename={filename} className="h-viewport-pane" />}
    </div>
  )
}
