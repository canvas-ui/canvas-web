export interface DocumentDragPayload {
  type?: string
  documentIds?: number[]
  sourceWorkspaceId?: string
  sourceTreeName?: string
  sourcePath?: string
}

const normalizePath = (path: string) => `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/'

/** Dropping back into the source folder must not write, move, or refresh. */
export function isSameDocumentFolder(source: DocumentDragPayload, workspaceId: string | undefined, treeName: string | undefined, path: string): boolean {
  return typeof source.sourcePath === 'string'
    && !!workspaceId && source.sourceWorkspaceId === workspaceId
    && !!treeName && source.sourceTreeName === treeName
    && normalizePath(source.sourcePath) === normalizePath(path)
}
