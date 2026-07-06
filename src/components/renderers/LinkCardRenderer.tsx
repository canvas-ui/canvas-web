import { useState } from 'react'
import { ExternalLink, Globe, Pin } from 'lucide-react'
import type { RendererProps } from './types'

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// Bookmark card for tab/link documents — favicon, title, host, open button,
// pinned badge and saved-at timestamp. A live iframe is deliberately NOT used:
// most sites block framing (X-Frame-Options / frame-ancestors) and the app CSP
// only allows blob:/youtube-nocookie frames, so an <iframe> would render blank.
export function LinkCardRenderer({ document: doc, className = '' }: RendererProps) {
  const data = (doc.data || {}) as Record<string, unknown>
  const url = String(data.url ?? data.uri ?? '')
  const title = String(data.title ?? data.label ?? '') || hostOf(url)
  const favIconUrl = typeof data.favIconUrl === 'string' ? data.favIconUrl : ''
  const pinned = data.pinned === true
  const timestamp = typeof data.timestamp === 'string' ? data.timestamp : null
  const [iconFailed, setIconFailed] = useState(false)

  return (
    <div className={`space-y-3 ${className}`}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/40"
      >
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
          {favIconUrl && !iconFailed
            ? <img src={favIconUrl} alt="" className="h-5 w-5" onError={() => setIconFailed(true)} />
            : <Globe className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium leading-tight">{title}</span>
            {pinned && <Pin className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" />}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{hostOf(url)}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground/70">{url}</div>
        </div>
        <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </a>
      {timestamp && (
        <p className="text-xs text-muted-foreground">Saved {new Date(timestamp).toLocaleString()}</p>
      )}
    </div>
  )
}
