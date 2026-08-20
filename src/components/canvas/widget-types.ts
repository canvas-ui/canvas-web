import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { CanvasQuerySpec, Document } from '@/types/workspace'

export interface WidgetDocumentsResult {
  payload: Document[]
  count?: number
  totalCount?: number
}

// Options a widget may pass when listing/searching the canvas' documents.
// Only the free-text `q` term is user-controlled; sort/pagination are clamped
// enums/ids so the term can never widen the server-side scope (which stays
// pinned to the canvas path + the caller's token). See getWorkspaceDocuments.
export interface WidgetFetchOpts {
  limit?: number
  offset?: number
  page?: number
  /** User-controlled free-text search term (FTS/vector only, never spec grammar). */
  q?: string
  /** Stacked refinement queries (repeated ?q=): each narrows the previous, last ranks. Wins over `q`. */
  queries?: string[]
  /** Timeline to sort by: 'crud:created' | 'crud:updated' | 'content' | any timeline name. */
  sortBy?: string
  order?: 'asc' | 'desc'
  /** Presence bitmaps every result must carry, e.g. ['data/mime/image']. Widget-fixed, not user input. */
  allOf?: string[]
}

// The canvas a widget lives on. Widgets fetch data via `fetchDocuments` rather
// than calling a service directly, so the same widget renders both in the
// authed app and on the read-only public canvas (which feeds preloaded docs).
export interface WidgetCanvasContext {
  workspaceId: string
  treeName: string
  path: string
  layerId: string
  querySpec?: CanvasQuerySpec
  // Layout/config is frozen (no add/remove/resize, no widget-config edits that
  // need a Save). True on home tiles AND public shares.
  readOnly?: boolean
  // Document-level controls are allowed (e.g. tick a todo done). These mutate
  // the underlying documents server-side, independent of the canvas config, so
  // they're available on any authenticated view — the workspace AND a read-only
  // home tile — and only withheld from the unauthenticated public share.
  interactive?: boolean
  fetchDocuments: (opts?: WidgetFetchOpts) => Promise<WidgetDocumentsResult>
  // Canvas-level view order (timeline sort). A widget's sort control edits THIS
  // (not local state) so it bakes into the canvas querySpec on Save — the frozen
  // view then sorts identically for the folder view and public shares.
  // `setCanvasSort` is absent on read-only canvases.
  canvasSort?: { sortBy: string; order: 'asc' | 'desc' }
  setCanvasSort?: (sort: { sortBy: string; order: 'asc' | 'desc' }) => void
  // Canvas-level search stack. A widget's search box appends to THIS (not local
  // state) so every widget on the canvas shares one query and it bakes into
  // querySpec.query on Save. Each term narrows the previous set (intersection),
  // the last ranks. `setCanvasQueries` is absent on read-only canvases (public
  // shares fall back to ephemeral local refinement).
  canvasQueries?: string[]
  setCanvasQueries?: (queries: string[]) => void
}

export type WidgetConfig = Record<string, unknown>

export interface WidgetProps {
  config: WidgetConfig
  setConfig: (next: WidgetConfig) => void
  canvas: WidgetCanvasContext
}

export interface WidgetSize {
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

// A widget definition is the single registration unit. Adding a new widget =
// one registerWidget({...}) call.
export interface WidgetDef {
  type: string
  name: string
  icon: LucideIcon
  defaultSize: WidgetSize
  /**
   * How much of the visible canvas this widget should claim once the grid
   * collapses to a single stacked column (phones), as a fraction of the host
   * height. Omitted = keep the saved row count.
   *
   * A saved layout is 12-column desktop geometry; its row count says how the
   * widget related to its NEIGHBOURS, which is meaningless once every widget is
   * full-width and stacked. Taken literally it produced 240px boxes whose own
   * toolbar filled them — the content then lived in a nested scroller inside a
   * scrolling page. So content-heavy widgets ask for a screenful here and the
   * page scrolls widget by widget, which is how a phone is read anyway.
   */
  mobileHeight?: number
  defaultConfig?: WidgetConfig
  component: ComponentType<WidgetProps>
}
