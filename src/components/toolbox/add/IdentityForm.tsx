import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../use-toolbox'
import { useAddTarget, describeTarget } from './useAddTarget'
import { useIdentityFields } from './useIdentityFields'
import { IdentityFields } from './IdentityFields'
import { TagInput } from './TagInput'
import { useTagSuggestions } from './useTagSuggestions'

export function IdentityForm() {
  const { closeAdd, state } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const f = useIdentityFields()
  const suggestions = useTagSuggestions(state.activeWorkspaceName)

  const handleSave = async () => {
    if (!target) return
    try {
      await f.save(target)
      showSuccessToast('Identity created')
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to create identity')
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <IdentityFields idPrefix="add-identity" workspaceName={state.activeWorkspaceName ?? undefined} {...f} emailValid={f.emailValid} />

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput tags={f.tags} onChange={f.setTags} suggestions={suggestions} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="identity-comment">Comment</Label>
        <textarea
          id="identity-comment"
          value={f.comment}
          onChange={(e) => f.setComment(e.target.value)}
          rows={3}
          placeholder="How you know them, where they came from…"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-elevation-1 transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <p className="text-xs text-muted-foreground">{describeTarget(target)}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeAdd} disabled={f.saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!target || !f.canSave}>
          {f.saving ? 'Saving…' : 'Save identity'}
        </Button>
      </div>
    </div>
  )
}
