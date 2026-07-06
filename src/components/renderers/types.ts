import type { Document } from '@/types/workspace'

// Contract for every per-filetype renderer: self-fetching (only needs the doc
// + workspace), so the same components drop into the object properties card,
// toolbox panels and canvas widgets.
export interface RendererProps {
  workspaceId: string
  document: Document
  className?: string
}

export const NOTE_SCHEMA = 'data/abstraction/note'
export const LINK_SCHEMA = 'data/abstraction/link'
export const TAB_SCHEMA = 'data/abstraction/tab'
export const FILE_SCHEMA = 'data/abstraction/file'
export const EMAIL_SCHEMA = 'data/abstraction/email'

export type MimeKind = 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'markdown' | 'binary'

export function classifyMime(mime: string, filename?: string | null): MimeKind {
  if (mime === 'text/markdown' || /\.(md|markdown)$/i.test(filename || '')) return 'markdown'
  if (!mime) return 'binary'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('text/') || mime.endsWith('+json') || mime === 'application/json' || mime === 'application/xml') return 'text'
  return 'binary'
}

// Extract a YouTube video id from watch/shorts/embed/youtu.be URLs; null if
// the URL is not YouTube.
export function youTubeVideoId(url: string | undefined | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/)
      if (m) return m[2]
    }
    return null
  } catch {
    return null
  }
}
