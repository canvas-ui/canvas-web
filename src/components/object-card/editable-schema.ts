import { NOTE_SCHEMA, LINK_SCHEMA, TAB_SCHEMA, TODO_SCHEMA, IDENTITY_SCHEMA, DRAWING_SCHEMA } from '@/components/renderers/types'
import { isTextBackedFile } from '@/lib/text-document'
import type { Document } from '@/types/workspace'

export function isEditableSchema(schema: string): boolean {
  return schema === NOTE_SCHEMA || schema === LINK_SCHEMA || schema === TAB_SCHEMA
    // A drawing's title is its filename on every surface — editable like any
    // other document's, while `data.scene` stays the sketch editor's business.
    || schema === TODO_SCHEMA || schema === DRAWING_SCHEMA
    || schema === IDENTITY_SCHEMA || schema.startsWith(`${IDENTITY_SCHEMA}/`)
}

/**
 * Does this document have an editable BODY (not just comment/tags)? Schema
 * alone cannot answer for files: a markdown or text file carries its body in a
 * blob, and edits through the same form as a note.
 */
export function isEditableDocument(doc: Document): boolean {
  return isEditableSchema(doc.schema) || isTextBackedFile(doc)
}
