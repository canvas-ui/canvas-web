import type { Document, DocumentGeo } from '../types/workspace'
import { tagsToFeatures } from '../components/toolbox/add/tags.ts'

// A metadata patch only: file bytes, data, EXIF and other metadata stay intact.
export function bulkEditMetadata(doc: Document, tags: string[], geo: DocumentGeo | null): Record<string, unknown> {
  return {
    ...(tags.length ? {
      features: [...new Set([
        ...(doc.features ?? doc.metadata?.features ?? []),
        ...tagsToFeatures((doc.data?.tags as string[] | undefined) ?? []),
        ...tagsToFeatures(tags),
      ])],
    } : {}),
    ...(geo ? { geo } : {}),
  }
}

// Omission preserves each document's own comment; an explicit empty string
// clears it. Comments belong to the document, outside its metadata patch.
export function bulkEditDocument(doc: Document, tags: string[], geo: DocumentGeo | null, comment?: string) {
  return {
    id: doc.id, schema: doc.schema, schemaVersion: doc.schemaVersion,
    metadata: bulkEditMetadata(doc, tags, geo),
    ...(comment !== undefined ? { comment: comment.trim() } : {}),
  }
}
