import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../use-toolbox'
import { LazyMarkdownEditor as MarkdownEditor } from '@/components/common/lazy-editor'
import { TagInput } from './TagInput'
import { useEditNoteFields } from './useEditNoteFields'
import { useTagSuggestions } from './useTagSuggestions'
import type { Document } from '@/types/workspace'

export function EditNoteForm() {
  const { state, closeAdd } = useToolbox()
  const { editDocument: doc, editWorkspaceId: workspaceId } = state
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  if (!doc || !workspaceId) return null

  return <EditNoteFormBody doc={doc} workspaceId={workspaceId} onCancel={closeAdd} onSaved={closeAdd} showSuccessToast={showSuccessToast} showErrorToast={showErrorToast} />
}

// Exported so DocumentSideCard (open-to-side view) can reuse the exact same
// edit UI without going through toolbox-context — onSaved is separate from
// onCancel so the side card can stay open after a save (only Cancel closes it).
export function EditNoteFormBody({ doc, workspaceId, onCancel, onSaved, showSuccessToast, showErrorToast }: {
  doc: Document
  workspaceId: string
  onCancel: () => void
  onSaved: () => void
  showSuccessToast: (msg: string) => void
  showErrorToast: (msg: string) => void
}) {
  const f = useEditNoteFields(doc, workspaceId)
  const suggestions = useTagSuggestions(workspaceId)

  const handleSave = async () => {
    try {
      await f.save()
      showSuccessToast('Note updated')
      onSaved()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to update note')
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="edit-note-title">Title</Label>
        <Input
          id="edit-note-title"
          value={f.title}
          onChange={(e) => f.setTitle(e.target.value)}
          placeholder="Optional; defaults to today's date"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <Label>Body</Label>
        <div className="flex-1">
          <MarkdownEditor value={f.content} onChange={f.setContent} placeholder="Write your note…" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput tags={f.tags} onChange={f.setTags} suggestions={suggestions} />
      </div>

      <div className="flex shrink-0 justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={f.saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!f.canSave}>
          {f.saving ? 'Saving…' : 'Save note'}
        </Button>
      </div>
    </div>
  )
}
