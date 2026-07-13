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
  readOnly?: boolean
  fetchDocuments: (opts?: WidgetFetchOpts) => Promise<WidgetDocumentsResult>
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
  defaultConfig?: WidgetConfig
  component: ComponentType<WidgetProps>
}
