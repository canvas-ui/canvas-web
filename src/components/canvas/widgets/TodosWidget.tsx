import { useCallback, useEffect, useState } from 'react'
import { ListTodo, Check, CalendarClock, Flag } from 'lucide-react'
import { registerWidget } from '../widget-registry'
import type { WidgetProps } from '../widget-types'
import type { Document } from '@/types/workspace'
import { TODO_SCHEMA } from '@/components/renderers/types'
import { TODO_STATUS_LABELS } from '@/components/toolbox/add/useTodoFields'
import { todoData, TODO_STATUS_STYLE, isOverdue, formatDue, setTodoStatus } from '@/lib/todo'
import { useDocumentActivation } from '../useDocumentActivation'

const TODO_FEATURE = 'data/schema/task'

export function TodoRow({ doc, workspaceId, readOnly, onChanged }: { doc: Document; workspaceId: string; readOnly: boolean; onChanged: () => void }) {
  const t = todoData(doc)
  const [busy, setBusy] = useState(false)
  const done = t.status === 'completed'
  const status = t.status ?? 'pending'
  const overdue = isOverdue(t)
  // The row is a shortcut into the full document modal (edit priority/status/…);
  // the checkbox keeps its own quick-toggle and stops the row from also opening.
  const { activationProps, stopRowActivation } = useDocumentActivation(doc, workspaceId)

  const toggle = async () => {
    if (readOnly || busy) return
    setBusy(true)
    try { await setTodoStatus(workspaceId, doc, done ? 'pending' : 'completed'); onChanged() }
    finally { setBusy(false) }
  }

  return (
    <div
      {...activationProps}
      title="Open details"
      className="canvas-no-drag flex cursor-pointer items-start gap-2.5 rounded-md border bg-card px-2.5 py-2 transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <button
        type="button"
        onClick={(e) => { stopRowActivation(e); toggle() }}
        disabled={readOnly || busy}
        aria-pressed={done}
        title={done ? 'Mark not done' : 'Mark done'}
        className={`canvas-no-drag mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${done ? 'border-success bg-success text-success-foreground' : 'border-input hover:border-success'} ${readOnly ? 'cursor-default opacity-70' : ''}`}
      >
        {done && <Check className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${done ? 'text-muted-foreground line-through' : ''}`}>{t.title || `Todo ${doc.id}`}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`rounded-full px-1.5 py-0.5 ${TODO_STATUS_STYLE[status]}`}>{TODO_STATUS_LABELS[status]}</span>
          {t.dueDate && (
            <span className={`inline-flex items-center gap-0.5 ${overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
              <CalendarClock className="h-3 w-3" />{formatDue(t.dueDate)}
            </span>
          )}
          {typeof t.priority === 'number' && (
            <span className="inline-flex items-center gap-0.5 text-muted-foreground"><Flag className="h-3 w-3" />P{t.priority}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// Task list over the canvas' context — every todo document, soonest due first
// (the 'tasks' timeline; undated tasks trail). Checkboxes toggle completion.
export function TodosWidget({ config, canvas }: WidgetProps) {
  const pageSize = typeof config.pageSize === 'number' ? config.pageSize : 50
  const [todos, setTodos] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hideDone, setHideDone] = useState(config.hideDone === true)
  const [reload, setReload] = useState(0)
  // Ticking a todo done mutates the document server-side, not the canvas config,
  // so it follows `interactive` (any authed view, incl. a read-only home tile),
  // not `readOnly`. Only the unauthenticated public share sets interactive=false.
  const readOnly = canvas.interactive === false

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await canvas.fetchDocuments({ limit: pageSize, allOf: [TODO_FEATURE], sortBy: 'tasks', order: 'asc' })
        if (cancelled) return
        // Public shares feed preloaded mixed docs; filter defensively.
        setTodos((res.payload || []).filter((d) => d.schema === TODO_SCHEMA))
      } catch {
        if (!cancelled) setTodos([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [canvas, pageSize, reload])

  // Refresh when a todo is created/edited elsewhere in the app.
  useEffect(() => {
    const onRefresh = () => setReload((n) => n + 1)
    window.addEventListener('workspace:documents:refresh', onRefresh)
    return () => window.removeEventListener('workspace:documents:refresh', onRefresh)
  }, [])

  const onChanged = useCallback(() => setReload((n) => n + 1), [])
  const visible = hideDone ? todos.filter((d) => todoData(d).status !== 'completed') : todos
  const openCount = todos.filter((d) => { const s = todoData(d).status; return s !== 'completed' && s !== 'cancelled' }).length

  return (
    <div className="flex h-full flex-col">
      <div className="canvas-no-drag flex items-center justify-between gap-2 border-b px-1 pb-2">
        <span className="text-xs text-muted-foreground">{openCount} open</span>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="h-3 w-3" />
          Hide done
        </label>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-1">
        {isLoading && todos.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">Loading todos…</div>
        ) : visible.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">No todos in this canvas' context.</div>
        ) : (
          visible.map((doc) => (
            <TodoRow key={doc.id} doc={doc} workspaceId={canvas.workspaceId} readOnly={readOnly} onChanged={onChanged} />
          ))
        )}
      </div>
    </div>
  )
}

registerWidget({
  type: 'todos',
  name: 'Todos',
  icon: ListTodo,
  defaultSize: { w: 4, h: 6, minW: 3, minH: 3 },
  defaultConfig: { pageSize: 50, hideDone: false },
  component: TodosWidget,
})
