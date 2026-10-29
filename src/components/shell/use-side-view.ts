import { createContext, useContext } from 'react'
import type { Document } from '@/types/workspace'
import type { DocumentSideLocation } from '@/lib/document-side-location'

export interface SideViewEntry {
  document: Document
  workspaceId: string
}

export interface SideViewContextValue {
  alwaysOn?: boolean
  entry: SideViewEntry | null
  open: (document: Document, workspaceId: string) => void
  /** Follow a saved revision in the current pane and its browser URL. */
  replace?: (document: Document, workspaceId: string) => void
  /** Reuse the reading pane for default document activation. */
  preview?: (document: Document, workspaceId: string) => void
  close: () => void
  location?: DocumentSideLocation | null
  loading?: boolean
  error?: string
  retry?: () => void
  update?: (change: Partial<Pick<DocumentSideLocation, 'section' | 'maximized'>>) => void
}

export const SideViewContext = createContext<SideViewContextValue | null>(null)

// No-op fallback (not throwing) — DocumentList, the consumer, also renders
// on public/unauthenticated routes (e.g. pages/pub/canvas.tsx) that sit
// outside AppShell/SideViewProvider; "open to the side" just no-ops there.
const noopSideView: SideViewContextValue = { entry: null, open: () => {}, close: () => {} }

export function useSideView(): SideViewContextValue {
  return useContext(SideViewContext) ?? noopSideView
}
