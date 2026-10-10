import type { Document } from '../types/workspace'
import { getDocumentDisplayInfo, getLocationFilename } from './document-display'

export function isDocumentFieldSort(sortBy?: string): boolean {
  return sortBy === 'alphabetical' || sortBy === 'type'
}

export function documentType(document: Document): string {
  if (document.schema === 'data/schema/file') {
    const extension = /\.([^.]+)$/.exec(getLocationFilename(document))?.[1]
    return (extension || document.metadata?.contentType || 'file').toLowerCase()
  }
  return document.schema.split('/').pop() || document.schema
}

export function sortDocuments<T extends Document>(documents: T[], sortBy: string, order = 'asc'): T[] {
  const direction = order === 'desc' ? -1 : 1
  const compare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  const keyed = documents.map(document => ({ document, title: getDocumentDisplayInfo(document).title, type: documentType(document) }))
  keyed.sort((a, b) => ((sortBy === 'type' ? compare(a.type, b.type) : 0)
    || compare(a.title, b.title) || a.document.id - b.document.id) * direction)
  return keyed.map(({ document }) => document)
}

// Timeline ordering is handled by the server. Field ordering uses the display
// names the UI shows and must collect the scoped result BEFORE slicing a page.
// Bounded reads work with endpoints that cap their maximum response size.
export async function getFieldSortedDocuments<T extends Document, E extends { payload: T[]; count?: number | null; totalCount?: number | null }>(
  options: { sortBy?: string; order?: 'asc' | 'desc'; limit?: number; offset?: number; page?: number },
  fetchPage: (pagination: { limit: number; offset: number; page: undefined }) => Promise<E>,
): Promise<E> {
  const documents: T[] = []
  const seen = new Set<number>()
  let response: E
  let offset = 0
  let batchSize = 500
  do {
    // Use offset alone: a fixed page=1 can override it on older endpoints.
    response = await fetchPage({ limit: batchSize, offset, page: undefined })
    // Learn an endpoint's response cap once, then keep a stable scan stride.
    // Later pages can be short when indexed IDs cannot be hydrated; advancing
    // by their returned length would overlap the same candidate window.
    if (offset === 0 && response.payload.length && response.payload.length < batchSize
      && (response.totalCount == null || response.payload.length < response.totalCount)) {
      batchSize = response.payload.length
      // Re-read the first window at the learned size. Its short response may
      // reflect missing records rather than a cap; using the large window's
      // documents with the smaller stride would overlap them on later reads.
      response = await fetchPage({ limit: batchSize, offset, page: undefined })
    }
    if (!response.payload.length && (response.totalCount == null || offset >= response.totalCount)) break
    let added = 0
    for (const document of response.payload) {
      if (!seen.has(document.id)) { seen.add(document.id); documents.push(document); added++ }
    }
    if (response.payload.length && !added) throw new Error('Document pagination did not advance')
    offset += batchSize
    if (response.totalCount != null && offset >= response.totalCount) break
  } while (true)
  const sorted = sortDocuments(documents, options.sortBy!, options.order)
  const limit = options.limit ?? 50
  const start = Math.max(0, options.offset ?? ((options.page ?? 1) - 1) * (limit || 100))
  const payload = limit === 0 ? sorted : sorted.slice(start, start + limit)
  return { ...response, payload, count: payload.length, totalCount: sorted.length }
}
