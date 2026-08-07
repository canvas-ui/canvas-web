import type { ComponentType } from 'react'
import { StickyNote, type LucideIcon } from 'lucide-react'
import { NotesApplet } from './NotesApplet'

// Applets are small self-contained apps hosted by the toolbox Apps tab (and
// eventually the tauri desktop shell - keep them portable: no page-level
// assumptions, all data access through services + the toolbox context).
//
// Modes:
// - context: the applet is tied to the focused context (a workspace path or a
//   context) - everything it reads is pre-filtered by that context.
// - global: context-free (a clock, a music player, a chat window).
// An applet declares which modes it supports; the Apps tab lists it under the
// matching sub-tab(s).
export type AppletMode = 'context' | 'global'

export interface AppletDescriptor {
  id: string
  label: string
  icon: LucideIcon
  modes: AppletMode[]
  // One-liner for the launcher tile.
  description: string
  Component: ComponentType
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
]

export function appletsForMode(mode: AppletMode): AppletDescriptor[] {
  return APPLETS.filter(a => a.modes.includes(mode))
}
