import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { CanvasQuerySpec, Document } from '@/types/workspace'

export interface WidgetDocumentsResult {
  payload: Document[]
  count?: number
  totalCount?: number
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
  fetchDocuments: (opts?: { limit?: number; page?: number }) => Promise<WidgetDocumentsResult>
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
