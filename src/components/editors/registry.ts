import { Brush, type LucideIcon } from 'lucide-react'
import type { Document } from '@/types/workspace'
import type { AddTarget } from '@/components/toolbox/add/useAddTarget'
import { DRAWING_SCHEMA } from '@/components/renderers/types'

// ─── Editor registry ─────────────────────────────────────────────────────────
// Content-producing editors integrate through this contract, never by porting
// editor code into Canvas. Canvas owns the DOCUMENT side: what schema/blob an
// editor emits, where it lands (the current add target), how a document
// round-trips back into its editor, and how it renders when not being edited
// (renderer registry, off the preview blob). The editor itself is a lazy
// chunk hosted on a standalone surface (today: the applet host /apps/<id>),
// so a new editor costs the main bundle nothing.
//
// An "editor" need not be interactive canvas code at all — a server-side
// operation with a thin parameter UI (e.g. a video trim endpoint driven by a
// range slider) registers the same way.

export interface EditorDescriptor {
  id: string
  label: string
  icon: LucideIcon
  /** Document schemas this editor produces and can re-open. */
  schemas: string[]
  /** Offered on creation surfaces (insert menus). */
  canCreate: boolean
  canEdit(doc: Document): boolean
  /** Standalone surface URL that creates a new document into `target`. */
  createUrl(target: AddTarget): string
  /** Standalone surface URL that opens `doc` for further editing. */
  editUrl(doc: Document, target: AddTarget): string
}

// Serialize an add-target into applet-host binding params (pages/apps/index.tsx
// reads context | workspace/path/tree; absent params fall back to the host's
// defaults, and the host's own binding picker can always re-aim).
function bindingParams(target: AddTarget): URLSearchParams {
  const params = new URLSearchParams()
  if (target?.mode === 'context') params.set('context', target.contextId)
  if (target?.mode === 'workspace') {
    params.set('workspace', target.workspaceName)
    params.set('path', target.path)
    params.set('tree', target.treeName)
  }
  return params
}

export const sketchEditor: EditorDescriptor = {
  id: 'sketch',
  label: 'Sketch',
  icon: Brush,
  schemas: [DRAWING_SCHEMA],
  canCreate: true,
  canEdit: (doc) => doc.schema === DRAWING_SCHEMA,
  createUrl(target) {
    const params = bindingParams(target)
    params.set('add', '1')
    return `/apps/sketch?${params.toString()}`
  },
  editUrl(doc, target) {
    const params = bindingParams(target)
    params.set('doc', String(doc.id))
    return `/apps/sketch?${params.toString()}`
  },
}

export const EDITORS: EditorDescriptor[] = [sketchEditor]

export function editorForDocument(doc: Document): EditorDescriptor | null {
  return EDITORS.find((e) => e.canEdit(doc)) ?? null
}
