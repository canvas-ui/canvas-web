import { useEffect } from 'react'
import { ListTodo } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { useTodoFields } from '@/components/toolbox/add/useTodoFields'
import { TodoFields } from '@/components/toolbox/add/TodoFields'
import { TagInput } from '@/components/toolbox/add/TagInput'
import { GeotagToggle } from '@/components/toolbox/add/GeotagToggle'
import { B5Card, type B5SaveTarget } from '../B5Card'
import type { QuickAddInitialData } from '../quick-add-types'

export function TodoCardBody({ onClose, initialData }: { onClose: () => void; initialData?: QuickAddInitialData }) {
  const f = useTodoFields()

  useEffect(() => {
    if (initialData?.title) f.setTitle(initialData.title)
    if (initialData?.content) f.setDescription(initialData.content)
    // Prefill once on open only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <B5Card
      title="New Todo"
      icon={ListTodo}
      onClose={onClose}
      onSave={(target: B5SaveTarget) => f.save({ mode: 'workspace', ...target })}
      canSave={f.canSave}
      saving={f.saving}
      successMessage="Todo created"
    >
      <div className="flex h-full flex-col gap-4 p-4">
        <TodoFields {...f} idPrefix="qa-todo" />
        <div className="space-y-1.5">
          <Label>Tags</Label>
          <TagInput tags={f.tags} onChange={f.setTags} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qa-todo-comment">Comment</Label>
          <textarea
            id="qa-todo-comment"
            value={f.comment}
            onChange={(e) => f.setComment(e.target.value)}
            rows={3}
            placeholder="Optional context"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-elevation-1 transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <GeotagToggle geotag={f.geotag} idPrefix="qa-todo-geotag" />
      </div>
    </B5Card>
  )
}
