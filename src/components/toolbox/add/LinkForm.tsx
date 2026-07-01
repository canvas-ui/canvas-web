import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { TagInput } from './TagInput'
import { useAddTarget, describeTarget } from './useAddTarget'
import { useLinkFields } from './useLinkFields'

export function LinkForm() {
  const { closeAdd } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const f = useLinkFields()

  const canSave = !!target && f.canSave

  const handleSave = async () => {
    if (!target) return
    try {
      await f.save(target)
      showSuccessToast('Link created')
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to create link')
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="link-url">URL</Label>
        <Input
          id="link-url"
          value={f.url}
          onChange={(e) => f.setUrl(e.target.value)}
          placeholder="https://example.com"
          autoFocus
        />
        {f.showUrlError && (
          <p className="text-xs text-destructive">Enter a valid URL, e.g. https://example.com</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="link-title">Title</Label>
        <Input
          id="link-title"
          value={f.title}
          onChange={(e) => f.setTitle(e.target.value)}
          placeholder="Optional display title"
        />
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
          {f.saving ? 'Saving…' : 'Save link'}
        </Button>
      </div>
    </div>
  )
}
