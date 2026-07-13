import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TODO_STATUSES, TODO_STATUS_LABELS, type TodoStatus } from './useTodoFields'

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

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
const textareaClass = 'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

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
          {/* datetime-local IS the native calendar+time picker; pre-filled to today EOD. */}
          <Input id={`${idPrefix}-due`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-priority`}>Priority (1–9)</Label>
          <Input
            id={`${idPrefix}-priority`}
            type="number"
            min={1}
            max={9}
            value={priority}
            onChange={(e) => setPriority(e.target.value === '' ? '' : Math.max(1, Math.min(9, Number(e.target.value))))}
            placeholder="—"
          />
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
