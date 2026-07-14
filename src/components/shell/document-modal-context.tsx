import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ObjectPropertiesModal } from '@/components/object-card/ObjectPropertiesModal'
import type { Document } from '@/types/workspace'

interface Entry {
  document: Document
  workspaceId: string
}

interface DocumentModalContextValue {
  // Open the shared document details modal for any document (e.g. a map pin).
  open: (document: Document, workspaceId: string) => void
  close: () => void
}

const DocumentModalContext = createContext<DocumentModalContextValue | null>(null)

// Global host for the ONE shared document details modal. Components anywhere
// under the shell (map pins, widgets, …) call `useDocumentModal().open(doc, ws)`
// instead of mounting their own ObjectPropertiesModal. Mirrors SideViewProvider.
export function DocumentModalProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<Entry | null>(null)
  const open = useCallback((document: Document, workspaceId: string) => setEntry({ document, workspaceId }), [])
  const close = useCallback(() => setEntry(null), [])
  const value = useMemo(() => ({ open, close }), [open, close])

  return (
    <DocumentModalContext.Provider value={value}>
      {children}
      <ObjectPropertiesModal
        document={entry?.document ?? null}
        isOpen={!!entry}
        onClose={close}
        workspaceId={entry?.workspaceId}
      />
    </DocumentModalContext.Provider>
  )
}

// No-op fallback (not throwing) so consumers outside the shell just do nothing.
const noop: DocumentModalContextValue = { open: () => {}, close: () => {} }

export function useDocumentModal(): DocumentModalContextValue {
  return useContext(DocumentModalContext) ?? noop
}
