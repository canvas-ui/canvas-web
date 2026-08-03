import { useState } from 'react'
import { Check, CalendarClock, Flag } from 'lucide-react'
import type { RendererProps } from './types'
import { usePublicShareCode } from './public-share'
import { TODO_STATUS_LABELS } from '@/components/toolbox/add/useTodoFields'
import { todoData, TODO_STATUS_STYLE, isOverdue, formatDue, setTodoStatus } from '@/lib/todo'

// Task card for todo documents — completion checkbox (toggles status), status
// badge, due date (highlighted when overdue), priority and description. The
// checkbox writes back via updateWorkspaceDocument, so it's disabled on
// read-only public shares.
export function TodoRenderer({ document: doc, workspaceId, className = '' }: RendererProps) {
  const t = todoData(doc)
  const isPublic = usePublicShareCode() != null
  const [busy, setBusy] = useState(false)
  const done = t.status === 'completed'
  const status = t.status ?? 'pending'
  const overdue = isOverdue(t)

  const toggle = async () => {
    if (isPublic || busy) return
    setBusy(true)
    try { await setTodoStatus(workspaceId, doc, done ? 'pending' : 'completed') }
    finally { setBusy(false) }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
        <button
          type="button"
          onClick={toggle}
          disabled={isPublic || busy}
          aria-pressed={done}
          title={done ? 'Mark not done' : 'Mark done'}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${done ? 'border-success bg-success text-success-foreground' : 'border-input hover:border-success'} ${isPublic ? 'cursor-default opacity-70' : ''}`}
        >
          {done && <Check className="h-3.5 w-3.5" />}
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
          {t.description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{t.description}</p>}
        </div>
      </div>
    </div>
  )
}
