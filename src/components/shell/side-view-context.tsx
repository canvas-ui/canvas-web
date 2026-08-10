import { useState, type ReactNode } from 'react'
import { SideViewContext, type SideViewContextValue, type SideViewEntry } from './side-view-context-data'

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
