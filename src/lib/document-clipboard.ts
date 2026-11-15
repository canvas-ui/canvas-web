import { useSyncExternalStore } from 'react'

/**
 * Copied/cut documents, shared by every surface that can paste them (content
 * area, side pane, sidebar tree). Module state rather than component state so
 * a surface mounted after the copy still offers Paste.
 */
interface DocumentClipboard {
  workspaceName: string
  documentIds: number[]
  operation: 'copy' | 'cut'
  sourcePath?: string
  sourceTreeName?: string
}

let current: DocumentClipboard | null = null
const listeners = new Set<() => void>()

export function setDocumentClipboard(next: DocumentClipboard | null): void {
  current = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The clipboard as seen from one workspace: document ids are workspace-local. */
export function useDocumentClipboard(workspaceName?: string | null): DocumentClipboard | null {
  const value = useSyncExternalStore(subscribe, () => current)
  return value && value.workspaceName === workspaceName ? value : null
}
