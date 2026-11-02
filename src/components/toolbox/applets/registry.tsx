import type { AppCategory } from '@/lib/app-catalog'
import { lazy, Suspense, type ComponentType } from 'react'
import { TerminalSquare, Brush, ListTodo, ScanEye, StickyNote, SlidersHorizontal, type LucideIcon } from 'lucide-react'

// Applets are small self-contained apps hosted by the toolbox Apps tab, the
// /apps/<id> content route, and the desktop shell - keep
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
  category: AppCategory
  modes: AppletMode[]
  // One-liner for the launcher tile.
  description: string
  Component: ComponentType<AppletProps>
}

function loadApplet(load: () => Promise<{ default: ComponentType<AppletProps> }>): ComponentType<AppletProps> {
  const Applet = lazy(load)
  return function LoadedApplet(props) {
    return <Suspense fallback={<p className="p-4 text-sm text-muted-foreground" role="status">Opening app…</p>}><Applet {...props} /></Suspense>
  }
}

const TerminalApplet = loadApplet(() => import('./TerminalApplet').then(module => ({ default: module.TerminalApplet })))
const NotesApplet = loadApplet(() => import('./NotesApplet').then(module => ({ default: module.NotesApplet })))
const TodosApplet = loadApplet(() => import('./TodosApplet').then(module => ({ default: module.TodosApplet })))
const LensApplet = loadApplet(() => import('./LensApplet').then(module => ({ default: module.LensApplet })))
const FiltersApplet = loadApplet(() => import('./FiltersApplet').then(module => ({ default: module.FiltersApplet })))
const SketchApplet = loadApplet(() => import('./SketchApplet').then(module => ({ default: module.SketchApplet })))

export const APPLETS: AppletDescriptor[] = [
  { id: 'terminal', category: 'utilities', label: 'Terminal', icon: TerminalSquare, modes: ['context'], description: 'Shell sessions for this context', Component: TerminalApplet },
  { id: 'filters', category: 'utilities', label: 'Filters', icon: SlidersHorizontal, modes: ['context', 'global'], description: 'Search and filter a workspace or a live context', Component: FiltersApplet },
  {
    id: 'notes',
    category: 'productivity',
    label: 'Notes',
    icon: StickyNote,
    modes: ['context'],
    description: 'All notes in the current context, editable in place',
    Component: NotesApplet,
  },
  {
    id: 'todo',
    category: 'productivity',
    label: 'Todos',
    icon: ListTodo,
    modes: ['context'],
    description: 'Todos in the current context, done items hidden by default',
    Component: TodosApplet,
  },
  {
    id: 'sketch',
    category: 'creative',
    label: 'Sketch',
    icon: Brush,
    modes: ['context'],
    description: 'Quick-sketch into the current context; tap a sketch to keep editing',
    Component: SketchApplet,
  },
  {
    id: 'lens',
    category: 'media',
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
