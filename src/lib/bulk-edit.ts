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
