import { createContext, useContext } from 'react'
import type { Document } from '@/types/workspace'

export interface DocumentModalContextValue {
  // Open the shared document details modal for any document (e.g. a map pin).
  open: (document: Document, workspaceId: string) => void
  close: () => void
}

export const DocumentModalContext = createContext<DocumentModalContextValue | null>(null)

// No-op fallback (not throwing) so consumers outside the shell just do nothing.
const noop: DocumentModalContextValue = { open: () => {}, close: () => {} }

export function useDocumentModal(): DocumentModalContextValue {
  return useContext(DocumentModalContext) ?? noop
}
