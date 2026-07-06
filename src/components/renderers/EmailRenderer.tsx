import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { Download, FileText } from 'lucide-react'
import { fetchDocumentBlob, downloadDocument } from '@/services/workspace'
import type { RendererProps } from './types'

interface EmailParty { address?: string; name?: string }
interface EmailAttachment {
  filename?: string
  contentType?: string
  size?: number
  contentId?: string
  isInline?: boolean
  url?: string
}

function partyLabel(p: string | EmailParty | undefined | null): string {
  if (!p) return ''
  if (typeof p === 'string') return p
  if (p.name && p.address) return `${p.name} <${p.address}>`
  return p.address || p.name || ''
}

function partiesLabel(list: unknown): string {
  if (!list) return ''
  const arr = Array.isArray(list) ? list : [list]
  return arr.map((p) => partyLabel(p as string | EmailParty)).filter(Boolean).join(', ')
}

function formatSize(size?: number): string {
  if (!Number.isFinite(size)) return ''
  const n = Number(size)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// Sanitize an email HTML body and wrap it in a self-contained document served
// from a blob: URL inside a fully sandboxed iframe. Defense in depth:
//   1. DOMPurify strips scripts/embeds/forms.
//   2. iframe sandbox="" (no scripts, no same-origin, no top-nav).
//   3. Embedded CSP meta: only data:/blob: images, inline styles — remote
//      images stay blocked (privacy default; also blocked by the app CSP).
// cid: inline images are substituted with blob: URLs fetched from the
// attachment blobs (matched on contentId); unresolved cid refs are stripped.
function buildEmailHtmlBlob(rawHtml: string, cidMap: Map<string, string>): string {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || ''
      if (src.toLowerCase().startsWith('cid:')) {
        const cid = src.slice(4).replace(/^<|>$/g, '')
        const blobUrl = cidMap.get(cid) || cidMap.get(`<${cid}>`)
        if (blobUrl) node.setAttribute('src', blobUrl)
        else node.removeAttribute('src')
      }
    }
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  try {
    const clean = DOMPurify.sanitize(rawHtml, {
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'link', 'meta'],
      FORBID_ATTR: ['srcset'],
    })
    const doc = `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'">
<style>body{margin:12px;font:14px/1.5 system-ui,sans-serif;color:#1a1a1a;background:#fff;word-break:break-word}img{max-width:100%}</style>
</head><body>${clean}</body></html>`
    return URL.createObjectURL(new Blob([doc], { type: 'text/html' }))
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes')
  }
}

export function EmailRenderer({ workspaceId, document: doc, className = '' }: RendererProps) {
  const data = (doc.data || {}) as Record<string, unknown>
  const attachments = (Array.isArray(data.attachments) ? data.attachments : []) as EmailAttachment[]
  const bodyHtml = typeof data.bodyHtml === 'string' && data.bodyHtml.trim() ? data.bodyHtml : null
  const bodyText = typeof data.body === 'string' ? data.body : ''

  const [htmlUrl, setHtmlUrl] = useState<string | null>(null)
  const [showPlain, setShowPlain] = useState(!bodyHtml)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bodyHtml || showPlain) return
    let cancelled = false
    const created: string[] = []

    const inline = attachments.filter((a) => a.contentId && a.url)
    Promise.all(
      inline.slice(0, 20).map(async (a) => {
        try {
          const { blob } = await fetchDocumentBlob(workspaceId, doc.id, { url: a.url })
          const u = URL.createObjectURL(blob)
          created.push(u)
          return [String(a.contentId).replace(/^<|>$/g, ''), u] as const
        } catch {
          return null
        }
      }),
    ).then((pairs) => {
      if (cancelled) return
      const cidMap = new Map(pairs.filter(Boolean) as Array<readonly [string, string]>)
      const url = buildEmailHtmlBlob(bodyHtml, cidMap)
      created.push(url)
      setHtmlUrl(url)
    }).catch((e) => { if (!cancelled) setError(String(e instanceof Error ? e.message : e)) })

    return () => {
      cancelled = true
      created.forEach((u) => URL.revokeObjectURL(u))
      setHtmlUrl(null)
    }
    // attachments derives from doc.data — doc.id is the stable dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, doc.id, bodyHtml, showPlain])

  const date = typeof data.date === 'string' ? new Date(data.date).toLocaleString() : null
  const visibleAttachments = attachments.filter((a) => !a.isInline || !a.contentId)

  const onDownloadAttachment = async (a: EmailAttachment) => {
    if (!a.url) return
    try { await downloadDocument(workspaceId, doc.id, a.filename || 'attachment', { url: a.url }) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
        <div className="text-base font-semibold">{String(data.subject ?? '(no subject)')}</div>
        <div><span className="text-muted-foreground">From:</span> {partyLabel(data.from as string | EmailParty)}</div>
        {partiesLabel(data.to) && <div><span className="text-muted-foreground">To:</span> {partiesLabel(data.to)}</div>}
        {partiesLabel(data.cc) && <div><span className="text-muted-foreground">Cc:</span> {partiesLabel(data.cc)}</div>}
        {date && <div className="text-xs text-muted-foreground">{date}</div>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Body */}
      {!showPlain && bodyHtml ? (
        htmlUrl
          ? <iframe src={htmlUrl} sandbox="" title={String(data.subject ?? 'email')} className="min-h-[50vh] w-full rounded border bg-white" />
          : <p className="text-sm text-muted-foreground">Rendering...</p>
      ) : (
        <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-sm max-h-[60vh] overflow-auto">{bodyText || '(empty body)'}</pre>
      )}
      {bodyHtml && (
        <button onClick={() => setShowPlain(!showPlain)} className="text-xs text-primary hover:underline">
          {showPlain ? 'Show HTML' : 'Show plain text'}
        </button>
      )}

      {/* Attachments */}
      {visibleAttachments.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Attachments ({visibleAttachments.length})</div>
          {visibleAttachments.map((a, i) => (
            <div key={a.url || i} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{a.filename || 'attachment'}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatSize(a.size)}</span>
              </span>
              {a.url && (
                <button onClick={() => onDownloadAttachment(a)} className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
                  <Download className="h-3 w-3" /> Download
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
