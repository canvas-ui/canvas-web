import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { LazyMarkdownEditor as MarkdownEditor } from '@/components/common/lazy-editor'
import { TagInput } from './TagInput'
import { useAddTarget, describeTarget } from './useAddTarget'
import { useNoteFields } from './useNoteFields'

export function NoteForm() {
  const { closeAdd } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const f = useNoteFields()

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
          placeholder="Optional — defaults to today's date"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Body</Label>
        <MarkdownEditor value={f.content} onChange={f.setContent} placeholder="Write your note…" />
      </div>

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput tags={f.tags} onChange={f.setTags} />
      </div>

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
