import { updateWorkspaceDocument } from '@/services/workspace'
import type { Document } from '@/types/workspace'
import type { TodoStatus } from '@/components/toolbox/add/useTodoFields'

export interface TodoData {
  title?: string
  description?: string
  status?: TodoStatus
  completed?: boolean
  completedAt?: string
  dueDate?: string
  priority?: number
}

export function todoData(doc: Document): TodoData {
  return (doc.data || {}) as TodoData
}

// Badge styling per status (Tailwind classes, theme-aware via muted tokens).
export const TODO_STATUS_STYLE: Record<TodoStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  'in-progress': 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  completed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  cancelled: 'bg-muted text-muted-foreground line-through',
}

export function isOverdue(t: TodoData): boolean {
  if (!t.dueDate || t.status === 'completed' || t.status === 'cancelled') return false
  const due = new Date(t.dueDate).getTime()
  return Number.isFinite(due) && due < Date.now()
}

export function formatDue(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Persist a status change for a todo. Preserves the rest of data (BaseDocument
// .update replaces data wholesale), keeps the legacy `completed` boolean in
// sync, and stamps/clears completedAt. Fires the list-refresh event.
export async function setTodoStatus(workspaceId: string, doc: Document, status: TodoStatus): Promise<void> {
  const completed = status === 'completed'
  const nextData: Record<string, unknown> = { ...(doc.data || {}), status, completed }
  if (completed) nextData.completedAt = new Date().toISOString()
  else delete nextData.completedAt
  await updateWorkspaceDocument(workspaceId, {
    id: doc.id,
    schema: doc.schema,
    schemaVersion: doc.schemaVersion,
    data: nextData,
  })
  window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
}
