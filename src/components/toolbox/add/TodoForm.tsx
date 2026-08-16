import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { createBackendContainerDocument } from '@/services/workspace'
import { useToolbox } from '../use-toolbox'
import { useAddTarget, describeTarget } from './useAddTarget'
import { useTodoFields } from './useTodoFields'
import { useTodoDestinations } from './useTodoDestinations'
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
  // Writable remote destinations (rw GitHub repos) — 'canvas' is the local
  // default; remote choices file the todo as an issue there and it syncs back
  // into the backends tree via the connector.
  const destinations = useTodoDestinations(state.activeWorkspaceName)
  const [destination, setDestination] = useState('canvas')
  const [savingRemote, setSavingRemote] = useState(false)

  const remote = destinations.find((d) => `${d.driver}:${d.address}:${d.container}` === destination)
  const canSave = remote ? (f.title.trim().length > 0 && !savingRemote) : (!!target && f.canSave)

  const handleSave = async () => {
    if (remote) {
      setSavingRemote(true)
      try {
        await createBackendContainerDocument(
          state.activeWorkspaceName || '', remote.driver, remote.address, remote.container,
          {
            title: f.title.trim(),
            ...(f.description.trim() ? { description: f.description.trim() } : {}),
            ...(f.tags.length ? { labels: f.tags } : {}),
          },
        )
        showSuccessToast(`Issue created in ${remote.container}`)
        closeAdd()
      } catch (err) {
        showErrorToast(err instanceof Error ? err.message : 'Failed to create issue')
      } finally {
        setSavingRemote(false)
      }
      return
    }
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
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-elevation-1 transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      {destinations.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="todo-destination">Save to</Label>
          <select
            id="todo-destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-elevation-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="canvas">Canvas — {describeTarget(target)}</option>
            {destinations.map((d) => (
              <option key={`${d.driver}:${d.address}:${d.container}`} value={`${d.driver}:${d.address}:${d.container}`}>
                {d.label}
              </option>
            ))}
          </select>
          {remote && (
            <p className="text-xs text-muted-foreground">
              Creates a GitHub issue (due date, priority and status stay Canvas-side until the issue syncs back).
            </p>
          )}
        </div>
      )}
      <GeotagToggle geotag={f.geotag} idPrefix="todo-geotag" />
      {!remote && <p className="text-xs text-muted-foreground">{describeTarget(target)}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeAdd} disabled={f.saving || savingRemote}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave}>
          {(f.saving || savingRemote) ? 'Saving…' : (remote ? 'Create issue' : 'Save todo')}
        </Button>
      </div>
    </div>
  )
}
