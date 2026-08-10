import { createContext, useContext } from 'react'
import type { Document } from '@/types/workspace'

export interface DocumentModalContextValue {
  open: (document: Document, workspaceId: string) => void
  close: () => void
}

export const DocumentModalContext = createContext<DocumentModalContextValue | null>(null)
const noop: DocumentModalContextValue = { open: () => {}, close: () => {} }
export function useDocumentModal(): DocumentModalContextValue {
  return useContext(DocumentModalContext) ?? noop
}
