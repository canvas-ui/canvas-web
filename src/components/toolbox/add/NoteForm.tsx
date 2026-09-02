import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../use-toolbox'
import { DocumentBodyEditor } from '@/components/common/DocumentBodyEditor'
import { TagInput } from './TagInput'
import { useAddTarget, describeTarget } from './useAddTarget'
import { useNoteFields } from './useNoteFields'
import { useTagSuggestions } from './useTagSuggestions'
import { GeotagToggle } from './GeotagToggle'

export function NoteForm() {
  const { closeAdd, state } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const f = useNoteFields()
  const suggestions = useTagSuggestions(state.activeWorkspaceName)

  const canSave = !!target && f.canSave

  const handleSave = async () => {
    if (!target) return
    try {
      await f.save(target)
      showSuccessToast('Note created')
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to create note')
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="note-title">Title</Label>
        <Input
          id="note-title"
          value={f.title}
          onChange={(e) => f.setTitle(e.target.value)}
          placeholder="Optional; defaults to today's date"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Body</Label>
        <DocumentBodyEditor kind="markdown" value={f.content} onChange={f.setContent} placeholder="Write your note…" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note-comment">Comment</Label>
        <textarea
          id="note-comment"
          value={f.comment}
          onChange={(e) => f.setComment(e.target.value)}
          rows={2}
          placeholder="Optional; context you can't infer from the body"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-elevation-1 transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput tags={f.tags} onChange={f.setTags} suggestions={suggestions} />
      </div>

      <GeotagToggle geotag={f.geotag} idPrefix="note-geotag" />

      <p className="text-xs text-muted-foreground">{describeTarget(target)}</p>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeAdd} disabled={f.saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave}>
          {f.saving ? 'Saving…' : 'Save note'}
        </Button>
      </div>
    </div>
  )
}
