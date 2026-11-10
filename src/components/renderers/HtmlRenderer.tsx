import { useEffect, useState } from 'react'
import { Code, Eye, Play, Square } from 'lucide-react'
import { DownloadButton } from './media'
import { useDocumentBlobUrl } from './useDocumentBlobUrl'
import type { RendererProps } from './types'

// Above this the source view would freeze the tab; the page itself still renders.
const MAX_SOURCE_CHARS = 500_000

// Saved web pages (single-file .html) and generated HTML reports, rendered in
// a sandboxed iframe from a blob: URL.
//
// The sandbox never grants allow-same-origin: the blob: URL is minted on the
// app's origin, so a same-origin frame (or opening the blob top-level) would
// let page script read localStorage.authToken. With an opaque origin the page
// can run its own script but cannot reach the app, its storage, or its API
// cookies. The frame inherits the app CSP (blob: documents do), so inline
// script/style and data:/https: images work; external script hosts do not.
//
// Links are rewritten to open in a new browsing context: the app CSP's
// frame-src blocks navigating the frame itself to a remote URL. Fragment links
// stay in the frame.
function prepareHtml(source: string): string {
  const parsed = new DOMParser().parseFromString(source, 'text/html')
  for (const a of Array.from(parsed.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') || ''
    if (href.startsWith('#')) continue
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener noreferrer')
  }
  // <base href> would resolve every relative URL against a remote site the
  // frame cannot load; single-file pages have their assets inlined anyway.
  parsed.querySelectorAll('base').forEach((b) => b.remove())
  if (!parsed.querySelector('meta[charset]')) {
    const meta = parsed.createElement('meta')
    meta.setAttribute('charset', 'utf-8')
    parsed.head.prepend(meta)
  }
  const doctype = parsed.doctype ? `<!doctype ${parsed.doctype.name}>` : '<!doctype html>'
  return `${doctype}\n${parsed.documentElement.outerHTML}`
}

export function HtmlRenderer(props: RendererProps) {
  return <HtmlPage key={`${props.workspaceId}:${props.document.id}`} {...props} />
}

function HtmlPage({ workspaceId, document: doc, className = '' }: RendererProps) {
  const { blob, error, loading } = useDocumentBlobUrl(workspaceId, doc.id, { typeHint: 'text/html', version: doc.checksumArray?.[0] ?? null })
  const [source, setSource] = useState<string | null>(null)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [scripts, setScripts] = useState(true)
  const [showSource, setShowSource] = useState(false)

  useEffect(() => {
    if (!blob) return
    let cancelled = false
    let created: string | null = null
    blob.text().then((text) => {
      if (cancelled) return
      setSource(text)
      created = URL.createObjectURL(new Blob([prepareHtml(text)], { type: 'text/html;charset=utf-8' }))
      setFrameUrl(created)
    })
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
      setFrameUrl(null)
    }
  }, [blob])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (loading || !frameUrl) return <p className="text-sm text-muted-foreground">Loading page...</p>

  const toolButton = 'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

  return (
    <div className={`flex h-full min-h-0 min-w-0 flex-col gap-2 ${className}`}>
      {showSource ? (
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs max-h-viewport-pane">
          {source && source.length > MAX_SOURCE_CHARS ? `${source.slice(0, MAX_SOURCE_CHARS)}\n…` : source}
        </pre>
      ) : (
        <iframe
          // Remount when the sandbox changes: browsers apply sandbox flags at navigation.
          key={scripts ? 'scripts' : 'static'}
          src={frameUrl}
          title={doc.data?.title ? String(doc.data.title) : 'HTML page'}
          sandbox={scripts ? 'allow-scripts allow-popups allow-popups-to-escape-sandbox' : 'allow-popups allow-popups-to-escape-sandbox'}
          referrerPolicy="no-referrer"
          className="min-h-[60vh] w-full flex-1 rounded-md border bg-white"
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={toolButton} onClick={() => setShowSource(!showSource)}>
          {showSource ? <Eye className="h-3.5 w-3.5" /> : <Code className="h-3.5 w-3.5" />}
          {showSource ? 'Page' : 'Source'}
        </button>
        {!showSource && (
          <button type="button" className={toolButton} onClick={() => setScripts(!scripts)} title="Page scripts run isolated from the app">
            {scripts ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {scripts ? 'Disable scripts' : 'Enable scripts'}
          </button>
        )}
        <DownloadButton workspaceId={workspaceId} document={doc} />
      </div>
    </div>
  )
}
