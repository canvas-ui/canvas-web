import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useRelationFields } from './useRelationFields'
import { RelationFields } from './RelationFields'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../use-toolbox'
import { useAddTarget, describeTarget } from './useAddTarget'
import { buildTodoData, useTodoFields } from './useTodoFields'
import { createOnDestination, destinationForBackendPath, useCreateDestinations } from './useCreateDestinations'
import { tagsToFeatures } from './tags'
import { TodoFields } from './TodoFields'
import { TagInput } from './TagInput'
import { useTagSuggestions } from './useTagSuggestions'
import { GeotagToggle } from './GeotagToggle'
import { AddFormLayout } from './AddFormLayout'

export function TodoForm() {
  const { closeAdd, state } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const f = useTodoFields()
  const rel = useRelationFields(target, state.addRelateTo)
  const suggestions = useTagSuggestions(state.activeWorkspaceName)
  // Connected backends that take new tasks (a GitHub repository, a CalDAV
  // task list). 'canvas' is the local default; a remote choice creates the
  // todo there first and its mirror is linked into the current path.
  const destinations = useCreateDestinations(state.activeWorkspaceName, 'task')
  const [destination, setDestination] = useState('canvas')
  const [savingRemote, setSavingRemote] = useState(false)

  // Inside a backend's folder there is no Canvas path to save to: the todo
  // goes to the service that folder mirrors.
  const backendPath = target?.mode === 'workspace' && target.treeName === 'backends' ? target.path : null
  const remote = destinations.find((d) => d.key === destination)
    ?? (backendPath !== null ? destinationForBackendPath(destinations, backendPath) ?? destinations[0] : undefined)
  const canSave = remote ? (f.title.trim().length > 0 && !savingRemote) : (!!target && f.canSave)

  const handleSave = async () => {
    if (remote) {
      setSavingRemote(true)
      try {
        const id = await createOnDestination(state.activeWorkspaceName || '', remote, 'task', {
          ...buildTodoData({ title: f.title, description: f.description, status: f.status, priority: f.priority, due: f.due }),
          ...(f.tags.length ? { labels: f.tags } : {}),
        }, { features: tagsToFeatures(f.tags), target })
        const failed = await rel.write([id])
        showSuccessToast(failed ? `Todo created on ${remote.label}; some relations failed` : `Todo created on ${remote.label}`)
        closeAdd()
      } catch (err) {
        showErrorToast(err instanceof Error ? err.message : 'Failed to create the todo')
      } finally {
        setSavingRemote(false)
      }
      return
    }
    if (!target) return
    try {
      const ids = await f.save(target)
      const failed = await rel.write(ids)
      showSuccessToast(failed ? 'Todo created; some relations failed' : 'Todo created')
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to create todo')
    }
  }

  const wide = state.addModal
  return (
    <AddFormLayout
      wide={wide}
      main={<TodoFields {...f} part="main" markdown fill={wide} />}
      side={<>
        <TodoFields {...f} part="details" />
        <div className="space-y-1.5">
          <Label>Tags</Label>
          <TagInput tags={f.tags} onChange={f.setTags} suggestions={suggestions} />
        </div>
        {!remote && (
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
        )}
        {destinations.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="todo-destination">Save to</Label>
            <select
              id="todo-destination"
              value={remote?.key ?? 'canvas'}
              onChange={(e) => setDestination(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-elevation-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {backendPath === null && <option value="canvas">Canvas: {describeTarget(target)}</option>}
              {destinations.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            {remote && (
              <p className="text-xs text-muted-foreground">
                Created on {remote.label} first, then synced back into Canvas and linked here.
              </p>
            )}
          </div>
        )}
        {!remote && <GeotagToggle geotag={f.geotag} idPrefix="todo-geotag" />}
        <RelationFields f={rel} idPrefix="todo" />
        <p className="text-xs text-muted-foreground">{remote && backendPath !== null ? `Adds to ${remote.label}` : describeTarget(target)}</p>
      </>}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={closeAdd} disabled={f.saving || savingRemote}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {(f.saving || savingRemote) ? 'Saving…' : 'Save todo'}
          </Button>
        </div>
      }
    />
  )
}
