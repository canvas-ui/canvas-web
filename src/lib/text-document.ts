import { classifyMime, FILE_SCHEMA, NOTE_SCHEMA } from '@/components/renderers/types'
import { getLocationFilename } from '@/lib/document-display'
import type { Document } from '@/types/workspace'

/** How a document's body is edited: markdown WYSIWYG, or raw characters. */
export type BodyKind = 'markdown' | 'text'

/** Above this the body editor stays out of the way — a 1 MB log is not a note. */
export const MAX_EDITABLE_TEXT_BYTES = 1_000_000

/**
 * The body kind of a document, or null when its content is not text at all.
 *
 * A note (inline `data.content`) and a markdown FILE (blob-backed) are the same
 * thing to the user, so they are the same thing here: both edit as 'markdown'
 * in the same wrapper. Other text files edit as raw characters — round-tripping
 * a .json or .log through the markdown serializer would rewrite it on save.
 */
export function documentBodyKind(doc: Document): BodyKind | null {
  if (doc.schema === NOTE_SCHEMA) return 'markdown'
  if (doc.schema !== FILE_SCHEMA) return null
  const kind = classifyMime(String(doc.metadata?.contentType ?? ''), getLocationFilename(doc))
  if (kind === 'markdown') return 'markdown'
  if (kind === 'text') return 'text'
  return null
}

/** A blob-backed text/markdown file — editable body, saved as new bytes. */
export function isTextBackedFile(doc: Document): boolean {
  return doc.schema === FILE_SCHEMA && documentBodyKind(doc) != null
}

export function textFileTooLarge(doc: Document): boolean {
  const size = Number((doc.metadata as Record<string, unknown> | undefined)?.size ?? 0)
  return Number.isFinite(size) && size > MAX_EDITABLE_TEXT_BYTES
}
