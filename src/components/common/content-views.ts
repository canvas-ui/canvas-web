import type { LayerMetadata } from '@/types/workspace'

/**
 * Content-area view model. A tree path is a layer — the "task container" —
 * and its named views (tabs) persist in the layer's metadata as
 * `metadata.views`. PATCH tree/path/* replaces metadata wholesale, so writers
 * must merge the layer's other metadata keys alongside `views`.
 */

export type ContentViewKind = 'documents' | 'columns' | 'app'

// Full content-page apps a tab can host — each renders the layer's data
// through an app-shaped lens (see content-app-view.tsx).
export type ContentAppId = 'todos' | 'todo-app' | 'notes' | 'notes-app' | 'filters' | 'sketch' | 'lens'
export const CONTENT_APPS: ReadonlyArray<{ id: ContentAppId; label: string }> = [
  { id: 'todos', label: 'Todo list' },
  { id: 'todo-app', label: 'Todo App' },
  { id: 'notes', label: 'Notes list' },
  { id: 'notes-app', label: 'Notes App' },
  { id: 'sketch', label: 'Sketch' },
]

/** Notes use the ordinary document pipeline, including search and actions. */
export function contentViewSchema(view: ContentView | null): string | undefined {
  return view?.kind === 'app' && view.app === 'notes' ? 'data/schema/note' : undefined
}

export interface BoardColumnConfig {
  id: string
  label: string
  /** Schema prefixes — a document matches if its schema equals or starts with one. */
  schemas: string[]
  /** Free-text filter, editable under the column header, persisted with the view. */
  filter?: string
  /** Fixed pixel width set by dragging the column edge; unset = responsive default. */
  width?: number
}

export interface ContentView {
  id: string
  name: string
  kind: ContentViewKind
  columns?: BoardColumnConfig[]
  /** kind 'app' only — which content app the tab hosts. */
  app?: ContentAppId
}

export const DEFAULT_VIEW: ContentView = { id: 'default', name: 'All', kind: 'documents' }

export function defaultBoardColumns(): BoardColumnConfig[] {
  return [
    { id: 'emails', label: 'Emails', schemas: ['data/schema/message'] },
    { id: 'todos', label: 'Todos', schemas: ['data/schema/task'] },
    { id: 'notes', label: 'Notes', schemas: ['data/schema/note'] },
    { id: 'links', label: 'Links', schemas: ['data/schema/tab', 'data/schema/link'] },
    { id: 'files', label: 'Files', schemas: ['data/schema/file'] },
  ]
}

export function viewsFromLayerMetadata(metadata: LayerMetadata | undefined | null): ContentView[] {
  const raw = (metadata as { views?: unknown } | undefined | null)?.views
  if (!Array.isArray(raw)) return [DEFAULT_VIEW]
  const views = raw.filter((v): v is ContentView => {
    const view = v as { id?: unknown; name?: unknown; kind?: unknown; app?: unknown } | null
    if (!view || typeof view.id !== 'string' || typeof view.name !== 'string') return false
    if (view.kind === 'documents' || view.kind === 'columns') return true
    // Existing Filters/Lens tabs remain usable, but are no longer offered
    // in the new-tab picker.
    return view.kind === 'app' && (CONTENT_APPS.some((a) => a.id === view.app) || view.app === 'filters' || view.app === 'lens')
  })
  return views.length > 0 ? views : [DEFAULT_VIEW]
}
