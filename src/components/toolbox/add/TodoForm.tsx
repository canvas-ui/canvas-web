import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { useAddTarget, describeTarget } from './useAddTarget'
import { useTodoFields } from './useTodoFields'
import { TodoFields } from './TodoFields'
import { TagInput } from './TagInput'
import { useTagSuggestions } from './useTagSuggestions'
import { GeotagToggle } from './GeotagToggle'

export function TodoForm() {
  const { closeAdd, state } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const f = useTodoFields()
  const suggestions = useTagSuggestions(state.activeWorkspaceName)

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
      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput tags={f.tags} onChange={f.setTags} suggestions={suggestions} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="todo-comment">Comment</Label>
        <textarea
          id="todo-comment"
          value={f.comment}
          onChange={(e) => f.setComment(e.target.value)}
          rows={3}
          placeholder="Optional context"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <GeotagToggle geotag={f.geotag} idPrefix="todo-geotag" />
      <p className="text-xs text-muted-foreground">{describeTarget(target)}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeAdd} disabled={f.saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave}>{f.saving ? 'Saving…' : 'Save todo'}</Button>
      </div>
    </div>
  )
}
