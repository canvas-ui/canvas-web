import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Document } from '@/types/workspace'

interface SideViewEntry {
  document: Document
  workspaceId: string
}

interface SideViewContextValue {
  entry: SideViewEntry | null
  open: (document: Document, workspaceId: string) => void
  close: () => void
}

const SideViewContext = createContext<SideViewContextValue | null>(null)

// Global "open document to the side" state — shrinks ContentArea's main pane
// and shows the doc in a B5Card sibling. Additive to (not a replacement for)
// the pre-existing MenuTreeView/WorkspaceM2 "open to side" (canvas/tree-path
// side pane local to the workspace detail page) — that stays untouched.
export function SideViewProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<SideViewEntry | null>(null)

  const value: SideViewContextValue = {
    entry,
    open: (document, workspaceId) => setEntry({ document, workspaceId }),
    close: () => setEntry(null),
  }

  return <SideViewContext.Provider value={value}>{children}</SideViewContext.Provider>
}

// No-op fallback (not throwing) — DocumentList, the consumer, also renders
// on public/unauthenticated routes (e.g. pages/pub/canvas.tsx) that sit
// outside AppShell/SideViewProvider; "open to the side" just no-ops there.
const noopSideView: SideViewContextValue = { entry: null, open: () => {}, close: () => {} }

export function useSideView(): SideViewContextValue {
  return useContext(SideViewContext) ?? noopSideView
}
