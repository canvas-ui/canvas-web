import { useState } from 'react'
import { Check, CalendarClock, Flag, Loader2 } from 'lucide-react'
import type { RendererProps } from './types'
import { usePublicShareCode } from './public-share'
import { TODO_STATUS_LABELS } from '@/components/toolbox/add/useTodoFields'
import { todoData, TODO_STATUS_STYLE, isOverdue, formatDue, setTodoStatus } from '@/lib/todo'
import { useMirrorSaveState } from '@/lib/remote-mirror'
import { MarkdownView } from '@/components/common/markdown-view'

// Task card for todo documents — completion checkbox (toggles status), status
// badge, due date (highlighted when overdue), priority and description. The
// checkbox writes back via updateWorkspaceDocument, so it's disabled on
// read-only public shares.
//
// For a task synced from a connector the checkbox does not just save: the
// change travels to GitHub (or whichever source) before the mirror updates.
// That round trip is slow enough to read as a hang, so the card dims and says
// where the change is going while it is in flight.
export function TodoRenderer({ document: doc, workspaceId, className = '' }: RendererProps) {
  const t = todoData(doc)
  const isPublic = usePublicShareCode() != null
  const [busy, setBusy] = useState(false)
  const { replicating, label: replicatingLabel } = useMirrorSaveState(doc)
  const done = t.status === 'completed'
  const status = t.status ?? 'pending'
  const overdue = isOverdue(t)

  // The checkbox renders from the document, which only changes once the write
  // lands — so a tick shows nothing at all until then. The button carries its
  // own spinner to acknowledge the click, and a failed write has to say so:
  // for a connector-backed task the write goes to GitHub and can be rejected
  // (revoked token, missing scope), and silently leaving the box unticked
  // looks like a click that never registered.
  const toggle = async () => {
    if (isPublic || busy) return
    setBusy(true)
    try {
      await setTodoStatus(workspaceId, doc, done ? 'pending' : 'completed')
    } catch {
      // The API layer already reports the failure (handleApiError → toast) —
      // catching here is what stops it becoming an unhandled rejection and
      // leaves the checkbox showing the source's real state, not the click's.
    } finally { setBusy(false) }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className={`relative flex items-start gap-3 rounded-lg border bg-card p-3 transition-opacity ${replicating ? 'opacity-60' : ''}`}>
        <button
          type="button"
          onClick={toggle}
          disabled={isPublic || busy || replicating}
          aria-pressed={done}
          title={done ? 'Mark not done' : 'Mark done'}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${done ? 'border-success bg-success text-success-foreground' : 'border-input hover:border-success'} ${isPublic ? 'cursor-default opacity-70' : ''}`}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : done && <Check className="h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className={`font-medium leading-tight ${done ? 'text-muted-foreground line-through' : ''}`}>
            {t.title || `Todo ${doc.id}`}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 ${TODO_STATUS_STYLE[status]}`}>{TODO_STATUS_LABELS[status]}</span>
            {t.dueDate && (
              <span className={`inline-flex items-center gap-1 ${overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                <CalendarClock className="h-3 w-3" />{formatDue(t.dueDate)}{overdue ? ' · overdue' : ''}
              </span>
            )}
            {typeof t.priority === 'number' && (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Flag className="h-3 w-3" />P{t.priority}</span>
            )}
          </div>
          {t.description && <MarkdownView content={String(t.description)} className="mt-2 text-sm text-muted-foreground" />}
          {replicating && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <Loader2 className="h-3 w-3 animate-spin" />{replicatingLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
