import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { TagInput } from './TagInput'
import { useEditLinkFields } from './useEditLinkFields'
import { useTagSuggestions } from './useTagSuggestions'
import type { Document } from '@/types/workspace'

export function EditLinkForm() {
  const { state, closeAdd } = useToolbox()
  const { editDocument: doc, editWorkspaceId: workspaceId } = state
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  if (!doc || !workspaceId) return null

  return <EditLinkFormBody doc={doc} workspaceId={workspaceId} onCancel={closeAdd} onSaved={closeAdd} showSuccessToast={showSuccessToast} showErrorToast={showErrorToast} />
}

// Exported so DocumentSideCard (open-to-side view) can reuse the exact same
// edit UI without going through toolbox-context — onSaved is separate from
// onCancel so the side card can stay open after a save (only Cancel closes it).
export function EditLinkFormBody({ doc, workspaceId, onCancel, onSaved, showSuccessToast, showErrorToast }: {
  doc: Document
  workspaceId: string
  onCancel: () => void
  onSaved: () => void
  showSuccessToast: (msg: string) => void
  showErrorToast: (msg: string) => void
}) {
  const f = useEditLinkFields(doc, workspaceId)
  const suggestions = useTagSuggestions(workspaceId)

  const handleSave = async () => {
    try {
      await f.save()
      showSuccessToast('Link updated')
      onSaved()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to update link')
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="space-y-1.5">
        <Label>URL <span className="text-xs text-muted-foreground">(frozen)</span></Label>
        <Input value={f.url} disabled className="font-mono text-xs" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-link-label">Label</Label>
        <Input
          id="edit-link-label"
          value={f.label}
          onChange={(e) => f.setLabel(e.target.value)}
          placeholder="Optional display name"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput tags={f.tags} onChange={f.setTags} suggestions={suggestions} />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={f.saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!f.canSave}>
          {f.saving ? 'Saving…' : 'Save link'}
        </Button>
      </div>
    </div>
  )
}
