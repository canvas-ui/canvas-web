import type { ComponentType } from 'react'
import { getLocationFilename } from '@/lib/document-display'
import type { Document } from '@/types/workspace'
import {
  classifyMime, youTubeVideoId,
  NOTE_SCHEMA, EMAIL_SCHEMA, FILE_SCHEMA, LINK_SCHEMA, TAB_SCHEMA, TODO_SCHEMA,
  type RendererProps,
} from './types'
import { ImageRenderer, AudioRenderer, VideoRenderer, PdfRenderer } from './media'
import { PlaintextRenderer, MarkdownRenderer } from './text'
import { YouTubeEmbed } from './YouTubeEmbed'
import { UrlPdfRenderer } from './UrlPdfRenderer'
import { isPdfUrl } from './pdf-url'
import { LinkCardRenderer } from './LinkCardRenderer'
import { TodoRenderer } from './TodoRenderer'
import { EmailRenderer } from './EmailRenderer'
import { BinaryFallback } from './BinaryFallback'

// Central schema+mime → renderer mapping (replaces the ad-hoc if-chains that
// used to live in DocumentSideCard / file-preview). Renderers are
// self-fetching (RendererProps), so they are equally usable from the object
// properties card, toolbox panels and canvas widgets.
function resolveRenderer(document: Document): ComponentType<RendererProps> | null {
  const schema = document.schema
  if (schema === NOTE_SCHEMA) return MarkdownRenderer
  if (schema === TODO_SCHEMA) return TodoRenderer
  if (schema === EMAIL_SCHEMA) return EmailRenderer
  if (schema === TAB_SCHEMA || schema === LINK_SCHEMA) {
    const url = String(document.data?.url ?? document.data?.uri ?? '')
    if (youTubeVideoId(url)) return YouTubeEmbed
    if (isPdfUrl(url)) return UrlPdfRenderer
    return LinkCardRenderer
  }
  if (schema !== FILE_SCHEMA) return null

  const mime = String(document.metadata?.contentType || '')
  switch (classifyMime(mime, getLocationFilename(document))) {
    case 'image': return ImageRenderer
    case 'audio': return AudioRenderer
    case 'video': return VideoRenderer
    case 'pdf': return PdfRenderer
    case 'markdown': return MarkdownRenderer
    case 'text': return PlaintextRenderer
    default: return BinaryFallback
  }
}

export function DocumentRenderer({ workspaceId, document, className }: RendererProps) {
  // resolveRenderer only ever returns module-level components (never creates
  // one), so identity is stable per document — the static-components rule
  // can't see that (suppressed at the JSX below).
  const Renderer = resolveRenderer(document)
  if (!Renderer) {
    return <pre className="overflow-auto p-2 text-xs">{JSON.stringify(document.data, null, 2)}</pre>
  }
  // eslint-disable-next-line react-hooks/static-components
  return <Renderer workspaceId={workspaceId} document={document} className={className} />
}
