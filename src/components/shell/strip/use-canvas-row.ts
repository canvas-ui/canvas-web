import { createContext, useContext } from 'react'
import type { Document } from '@/types/workspace'

// State model for the strip layout (see StripShell.tsx).
//
// A ROW is one line of canvases. Row 0 is the desk row; every pin the user
// opens gets its own row (its "task container"). Within a row the MAIN canvas
// is the page at the browser URL (rendered through the shell <Outlet/>), and
// ENTRIES are the extra canvases opened to its right: either a second shell
// URL (rendered in its own in-memory router) or a single document card.
//
// Only the active row is bound to the browser URL: switching rows navigates
// to that row's remembered main location, and every URL change is written
// back into the active row's `main`.

export type CanvasEntrySpec =
  | { kind: 'route'; location: string }
  | { kind: 'document'; document: Document; workspaceId: string }

export type CanvasEntry = CanvasEntrySpec & { id: string; expanded?: boolean }

export interface CanvasRow {
  key: string
  label: string
  /** Shell URL of the row's main canvas (pathname + search). */
  main: string
  mainExpanded: boolean
  entries: CanvasEntry[]
}

export const MAIN_COLUMN = 'main'

export interface CanvasRowValue {
  rows: CanvasRow[]
  activeRow: number
  /** The column the keyboard walks from: 'm1' | 'm2' | MAIN_COLUMN | entry id. */
  focus: string
  setFocus: (column: string) => void
  /** Open a canvas to the right of the focused one (or focus it if already open). */
  openCanvas: (entry: CanvasEntrySpec) => void
  openDocument: (document: Document, workspaceId: string) => void
  closeCanvas: (id: string) => void
  /** Route entries own their location; the main canvas is the browser URL. */
  navigateCanvas: (id: string, location: string) => void
  toggleExpanded: (id: string) => void
  /** Bring a row to the front, creating it on first use; navigates to its main. */
  activateRow: (key: string, label: string, main: string) => void
  moveRow: (delta: number) => void
  closeRow: (key: string) => void
}

export const CanvasRowContext = createContext<CanvasRowValue | null>(null)

/** Null in the classic layout — callers fall back to their classic behavior. */
export function useCanvasRow(): CanvasRowValue | null {
  return useContext(CanvasRowContext)
}
