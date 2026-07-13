import { useEffect } from 'react'
import { ListTodo } from 'lucide-react'
import { useTodoFields } from '@/components/toolbox/add/useTodoFields'
import { TodoFields } from '@/components/toolbox/add/TodoFields'
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
      </div>
    </B5Card>
  )
}
