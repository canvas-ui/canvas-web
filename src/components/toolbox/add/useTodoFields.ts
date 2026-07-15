import { useState } from 'react'
import { submitDocuments, type AddTarget } from './useAddTarget'
import { TODO_SCHEMA } from '@/components/renderers/types'
import { useGeotag } from '@/hooks/useGeotag'

const TODO_SCHEMA_VERSION = '2.1'

// Mirrors synapsd Todo.js STATUS (VTODO-aligned).
export const TODO_STATUSES = ['pending', 'in-progress', 'completed', 'cancelled'] as const
export type TodoStatus = (typeof TODO_STATUSES)[number]

export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  pending: 'Pending',
  'in-progress': 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// dueDate is stored as a UTC ISO string (Todo.dataSchema requires z.datetime());
// the native <input type="datetime-local"> works in LOCAL time with no zone.
// These convert between the two.
function pad(n: number): string { return String(n).padStart(2, '0') }
function formatLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function isoToLocalInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : formatLocal(d)
}
export function localInputToISO(local: string): string | undefined {
  if (!local) return undefined
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}
// Default due: end of today (local), i.e. "till EOD".
export function todayEndOfDayLocal(): string {
  const d = new Date()
  d.setHours(23, 59, 0, 0)
  return formatLocal(d)
}

// Build the todo `data` payload from field state — shared by every add surface.
export function buildTodoData(fields: {
  title: string; description: string; status: TodoStatus; priority: number | ''; due: string
}): Record<string, unknown> {
  const dueISO = localInputToISO(fields.due)
  return {
    title: fields.title.trim(),
    ...(fields.description.trim() ? { description: fields.description.trim() } : {}),
    status: fields.status,
    completed: fields.status === 'completed',
    ...(dueISO ? { dueDate: dueISO } : {}),
    ...(fields.priority !== '' ? { priority: Number(fields.priority) } : {}),
  }
}

// Field state + doc-building + submit for the todo abstraction, shared by
// TodoForm (AddPanel) and TodoCardBody (home FAB card).
export function useTodoFields() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TodoStatus>('pending')
  const [priority, setPriority] = useState<number | ''>('')
  // Pre-selected: today, till end of day.
  const [due, setDue] = useState<string>(todayEndOfDayLocal())
  const [saving, setSaving] = useState(false)
  const geotag = useGeotag()

  const canSave = title.trim().length > 0 && !saving

  async function save(target: AddTarget): Promise<number[]> {
    setSaving(true)
    try {
      // Off by default; capture() resolves null unless the user opted in, and
      // never rejects — a missing fix must not block saving the todo.
      const geo = await geotag.capture()
      const doc = {
        schema: TODO_SCHEMA,
        schemaVersion: TODO_SCHEMA_VERSION,
        data: buildTodoData({ title, description, status, priority, due }),
        metadata: { ...(geo ? { geo } : {}) },
      }
      return await submitDocuments(target, [doc])
    } finally {
      setSaving(false)
    }
  }

  return {
    title, setTitle, description, setDescription, status, setStatus,
    priority, setPriority, due, setDue, saving, canSave, save, geotag,
  }
}
