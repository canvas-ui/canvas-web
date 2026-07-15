import { Button } from '@/components/ui/button'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { useAddTarget, describeTarget } from './useAddTarget'
import { useTodoFields } from './useTodoFields'
import { TodoFields } from './TodoFields'
import { GeotagToggle } from './GeotagToggle'

export function TodoForm() {
  const { closeAdd } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const f = useTodoFields()

  const canSave = !!target && f.canSave

  const handleSave = async () => {
    if (!target) return
    try {
      await f.save(target)
      showSuccessToast('Todo created')
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to create todo')
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <TodoFields {...f} />
      <GeotagToggle geotag={f.geotag} idPrefix="todo-geotag" />
      <p className="text-xs text-muted-foreground">{describeTarget(target)}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeAdd} disabled={f.saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave}>{f.saving ? 'Saving…' : 'Save todo'}</Button>
      </div>
    </div>
  )
}
