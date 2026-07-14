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
export const TODO_SCHEMA = 'data/abstraction/todo'

export type MimeKind = 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'markdown' | 'binary'

// Filename extension → concrete MIME. Used both to classify a document whose
// stored `contentType` is missing/generic (octet-stream) and to re-type the
// fetched blob so <img>/<video>/<audio> get a real MIME to decode.
const EXT_MIME: Record<string, string> = {
  // images
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
  // audio
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac',
  // video
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo', ogv: 'video/ogg',
  // documents / text
  pdf: 'application/pdf', md: 'text/markdown', markdown: 'text/markdown',
  txt: 'text/plain', json: 'application/json', xml: 'application/xml', csv: 'text/csv', log: 'text/plain', yml: 'text/yaml', yaml: 'text/yaml',
}

export function extOf(filename?: string | null): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '')
  return m ? m[1].toLowerCase() : ''
}

// Best-effort MIME from a filename; undefined when the extension is unknown.
export function mimeFromFilename(filename?: string | null): string | undefined {
  return EXT_MIME[extOf(filename)]
}

function kindFromMime(mime: string): MimeKind | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('text/') || mime.endsWith('+json') || mime === 'application/json' || mime === 'application/xml') return 'text'
  return null
}

export function classifyMime(mime: string, filename?: string | null): MimeKind {
  if (mime === 'text/markdown' || /\.(md|markdown)$/i.test(filename || '')) return 'markdown'
  // A concrete stored contentType wins; a missing/generic one (octet-stream,
  // common for files ingested by extension only) falls back to the filename —
  // otherwise an .mp4 with no contentType would render as an undownloadable
  // "binary" blob instead of a video player.
  if (mime && mime !== 'application/octet-stream') {
    const k = kindFromMime(mime)
    if (k) return k
  }
  const guessed = mimeFromFilename(filename)
  if (guessed) {
    const k = kindFromMime(guessed)
    if (k) return k
  }
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
