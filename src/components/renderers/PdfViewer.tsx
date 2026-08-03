import { useEffect, useRef, useState } from 'react'

// Mobile browsers (Android Chrome/WebView, PWAs) ship no inline PDF plugin —
// a blob: iframe renders blank or force-downloads. iOS Safari "supports" PDF
// iframes but only paints page 1 with no scroll. Desktop browsers all embed a
// real viewer. So: native iframe on desktop (fast, free UI), pdf.js canvas
// rendering everywhere else.
function hasUsableNativeViewer(): boolean {
  const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent)
  if (mobile) return false
  return navigator.pdfViewerEnabled !== false
}

// Pages past this cap are not rendered (memory: each page is a full canvas).
const MAX_RENDERED_PAGES = 40
// Render resolution cap — container width × dpr, but never wider than this.
const MAX_RENDER_WIDTH = 1600

interface PdfViewerProps {
  // Raw bytes for pdf.js (fetch(blob:) is blocked by connect-src, so the
  // object URL alone is not enough on the fallback path).
  blob: Blob | null
  // Object URL for the native iframe path.
  blobUrl: string
  filename: string
  className?: string
}

// Renders each page of `blob` into a canvas via lazily-imported pdf.js.
function PdfJsPages({ blob, filename }: { blob: Blob; filename: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<{ error: string | null; pages: number; truncated: boolean }>({ error: null, pages: 0, truncated: false })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let cleanupDoc: (() => void) | null = null

    ;(async () => {
      // Lazy import keeps pdf.js (~400 kB) out of the main bundle; the worker
      // is bundled by Vite and served same-origin (CSP worker-src 'self').
      const pdfjs = await import('pdfjs-dist')
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

      const data = await blob.arrayBuffer()
      if (cancelled) return
      const loadingTask = pdfjs.getDocument({ data })
      cleanupDoc = () => { loadingTask.destroy() }
      const doc = await loadingTask.promise
      if (cancelled) return

      const pageCount = Math.min(doc.numPages, MAX_RENDERED_PAGES)
      const containerWidth = container.clientWidth || 600
      const dpr = window.devicePixelRatio || 1

      for (let i = 1; i <= pageCount; i++) {
        if (cancelled) return
        const page = await doc.getPage(i)
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min(containerWidth * dpr, MAX_RENDER_WIDTH * dpr) / base.width
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        // Literal white: the PDF page *is* white paper. A themed ground
        // would show through the page margins and misrepresent the document.
        canvas.className = 'rounded border bg-white'
        canvas.setAttribute('aria-label', `${filename} — page ${i}`)

        await page.render({ canvas, viewport }).promise
        page.cleanup()
        if (cancelled) return
        container.appendChild(canvas)
        setStatus({ error: null, pages: i, truncated: doc.numPages > MAX_RENDERED_PAGES })
      }
    })().catch((e) => {
      if (!cancelled) setStatus((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }))
    })

    return () => {
      cancelled = true
      cleanupDoc?.()
      container.replaceChildren()
    }
  }, [blob, filename])

  return (
    <div className="space-y-2">
      {status.error && <p className="text-sm text-destructive">Could not render PDF: {status.error}</p>}
      {!status.error && status.pages === 0 && <p className="text-sm text-muted-foreground">Rendering PDF…</p>}
      <div ref={containerRef} className="space-y-2" />
      {status.truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the first {MAX_RENDERED_PAGES} pages — download the file for the full document.
        </p>
      )}
    </div>
  )
}

export function PdfViewer({ blob, blobUrl, filename, className = '' }: PdfViewerProps) {
  if (hasUsableNativeViewer() || !blob) {
    // Fill the free height of the (definite-height) preview area; min-h keeps
    // it usable when the host isn't height-constrained. className goes on the
    // wrapper so callers can set their own height without fighting h-full.
    return (
      <div className={`min-h-[300px] ${className}`}>
        <iframe src={blobUrl} className="h-full min-h-[300px] w-full rounded border" title={filename} />
      </div>
    )
  }
  return (
    <div className={`max-h-[70vh] overflow-y-auto ${className}`}>
      <PdfJsPages blob={blob} filename={filename} />
    </div>
  )
}
