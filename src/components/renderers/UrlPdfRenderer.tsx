import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { API_URL } from '@/config/api'
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
  const [state, setState] = useState<{ blobUrl: string | null; failed: boolean; loading: boolean }>({ blobUrl: null, failed: false, loading: true })
  // Render-time reset when the URL changes (no setState-in-effect).
  const [lastUrl, setLastUrl] = useState(url)
  if (url !== lastUrl) {
    setLastUrl(url)
    setState({ blobUrl: null, failed: false, loading: true })
  }

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null

    const toBlobUrl = async (res: Response) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      return URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' }))
    }

    const viaProxy = () => {
      const token = localStorage.getItem('authToken')
      return fetch(`${API_URL}/proxy/pdf?url=${encodeURIComponent(url)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    }

    fetch(url)
      .then(toBlobUrl)
      .catch(() => viaProxy().then(toBlobUrl))
      .then((blobUrl) => {
        if (cancelled) { URL.revokeObjectURL(blobUrl); return }
        createdUrl = blobUrl
        setState({ blobUrl, failed: false, loading: false })
      })
      .catch(() => { if (!cancelled) setState({ blobUrl: null, failed: true, loading: false }) })

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [url])

  const { blobUrl, failed, loading } = state

  return (
    <div className={`space-y-2 ${className}`}>
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <ExternalLink className="h-3 w-3" /> {url}
      </a>
      {loading && <p className="text-sm text-muted-foreground">Loading PDF…</p>}
      {failed && (
        <p className="text-sm text-muted-foreground">
          Inline preview unavailable (direct fetch and server proxy both failed) — use the link above.
        </p>
      )}
      {blobUrl && <iframe src={blobUrl} className="h-[70vh] w-full rounded border" title={url} />}
    </div>
  )
}
