export const DOCUMENT_SECTIONS = ['view', 'location', 'metadata', 'json', 'synapses', 'backends'] as const
export type DocumentSection = typeof DOCUMENT_SECTIONS[number]

export interface DocumentSideLocation {
  workspaceId: string
  documentId: number
  section: DocumentSection
  maximized: boolean
}

/** The fragment belongs to the reading pane; the path and query keep the canvas. */
export function readDocumentSideLocation(hash: string): DocumentSideLocation | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const id = params.get('document') ?? ''
  const workspaceId = params.get('workspace')
  if (!workspaceId || !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) return null
  const section = params.get('section')
  return {
    workspaceId, documentId: Number(id),
    section: DOCUMENT_SECTIONS.includes(section as DocumentSection) ? section as DocumentSection : 'view',
    maximized: params.get('fullscreen') === '1',
  }
}

export function documentSideHash(location: DocumentSideLocation): string {
  const params = new URLSearchParams({ document: String(location.documentId), workspace: location.workspaceId })
  if (location.section !== 'view') params.set('section', location.section)
  if (location.maximized) params.set('fullscreen', '1')
  return `#${params}`
}
