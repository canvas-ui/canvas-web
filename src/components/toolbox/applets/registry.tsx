import type { ComponentType } from 'react'
import { Brush, ListTodo, ScanEye, StickyNote, type LucideIcon } from 'lucide-react'
import { NotesApplet } from './NotesApplet'
import { TodosApplet } from './TodosApplet'
import { LensApplet } from './LensApplet'
import { SketchApplet } from './SketchApplet'

// Applets are small self-contained apps hosted by the toolbox Apps tab, the
// standalone /apps/<id> route, and eventually the tauri desktop shell - keep
// them portable: no page-level assumptions, all data access through services
// and the applet-target context.
//
// Modes:
// - context: the applet is tied to a focused context (a workspace path or a
//   context) - everything it reads is pre-filtered by that binding.
// - global: context-free (a clock, a music player, a chat window).
// An applet declares which modes it supports; the Apps tab lists it under the
// matching sub-tab(s).
export type AppletMode = 'context' | 'global'

// Props every applet component accepts. autoAdd opens the inline creation
// draft on mount - the standalone host maps ?add=1 onto it.
export interface AppletProps {
  autoAdd?: boolean
}

export interface AppletDescriptor {
  id: string
  label: string
  icon: LucideIcon
  modes: AppletMode[]
  // One-liner for the launcher tile.
  description: string
  Component: ComponentType<AppletProps>
}

export const APPLETS: AppletDescriptor[] = [
  {
    id: 'notes',
    label: 'Notes',
    icon: StickyNote,
    modes: ['context'],
    description: 'All notes in the current context, editable in place',
    Component: NotesApplet,
  },
  {
    id: 'todo',
    label: 'Todos',
    icon: ListTodo,
    modes: ['context'],
    description: 'Todos in the current context, done items hidden by default',
    Component: TodosApplet,
  },
  {
    id: 'sketch',
    label: 'Sketch',
    icon: Brush,
    modes: ['context'],
    description: 'Quick-sketch into the current context; tap a sketch to keep editing',
    Component: SketchApplet,
  },
  {
    id: 'lens',
    label: 'Lens',
    icon: ScanEye,
    modes: ['context'],
    description: 'Point a camera at things; matching documents surface live',
    Component: LensApplet,
  },
]

export function appletsForMode(mode: AppletMode): AppletDescriptor[] {
  return APPLETS.filter(a => a.modes.includes(mode))
}
