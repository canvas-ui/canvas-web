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
  fetchPage: (pagination: { limit: number; offset: number; page: number }) => Promise<E>,
): Promise<E> {
  const documents: T[] = []
  const seen = new Set<number>()
  let response: E
  let offset = 0
  do {
    response = await fetchPage({ limit: 500, offset, page: 1 })
    if (!response.payload.length) break
    let added = 0
    for (const document of response.payload) {
      if (!seen.has(document.id)) { seen.add(document.id); documents.push(document); added++ }
    }
    if (!added) throw new Error('Document pagination did not advance')
    offset += response.payload.length
    if (response.totalCount != null && offset >= response.totalCount) break
    if (response.totalCount == null && response.payload.length < 500) break
  } while (response.payload.length > 0)
  const sorted = sortDocuments(documents, options.sortBy!, options.order)
  const limit = options.limit ?? 50
  const start = Math.max(0, options.offset ?? ((options.page ?? 1) - 1) * (limit || 100))
  const payload = limit === 0 ? sorted : sorted.slice(start, start + limit)
  return { ...response, payload, count: payload.length, totalCount: sorted.length }
}
