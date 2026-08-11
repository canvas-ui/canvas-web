import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { TODO_STATUSES, TODO_STATUS_LABELS, type TodoStatus } from './useTodoFields'

// RFC 5545 priority is 1 (highest) … 9 (lowest); 0/unset = none. Label the
// endpoints and the midpoint so the selectbox reads meaningfully.
const PRIORITY_LABELS: Record<number, string> = {
  1: '1 — Highest', 2: '2', 3: '3 — High', 4: '4', 5: '5 — Medium',
  6: '6', 7: '7 — Low', 8: '8', 9: '9 — Lowest',
}

// Shared Todo form fields (title/description/due/status/priority) so the add
// form, home quick-add card, and edit dialog render an identical control set.
export interface TodoFieldValues {
  title: string; setTitle: (v: string) => void
  description: string; setDescription: (v: string) => void
  status: TodoStatus; setStatus: (v: TodoStatus) => void
  priority: number | ''; setPriority: (v: number | '') => void
  due: string; setDue: (v: string) => void
  idPrefix?: string
}

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-elevation-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
const textareaClass = 'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-elevation-1 transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function TodoFields({
  title, setTitle, description, setDescription, status, setStatus,
  priority, setPriority, due, setDue, idPrefix = 'todo',
}: TodoFieldValues) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-title`}>Title</Label>
        <Input id={`${idPrefix}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-desc`}>Description</Label>
        <textarea
          id={`${idPrefix}-desc`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Optional details…"
          className={textareaClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-due`}>Due</Label>
          {/* Calendar + 15-minute time slots (Outlook granularity); pre-filled to today EOD. */}
          <DateTimePicker id={`${idPrefix}-due`} value={due} onChange={setDue} placeholder="No due date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-priority`}>Priority</Label>
          <select
            id={`${idPrefix}-priority`}
            value={priority === '' ? '' : String(priority)}
            onChange={(e) => setPriority(e.target.value === '' ? '' : Number(e.target.value))}
            className={selectClass}
          >
            <option value="">None</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-status`}>Status</Label>
        <select id={`${idPrefix}-status`} value={status} onChange={(e) => setStatus(e.target.value as TodoStatus)} className={selectClass}>
          {TODO_STATUSES.map((s) => <option key={s} value={s}>{TODO_STATUS_LABELS[s]}</option>)}
        </select>
      </div>
    </>
  )
}
