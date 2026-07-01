import { useEffect } from 'react'
import { Link as LinkIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TagInput } from '@/components/toolbox/add/TagInput'
import { useLinkFields } from '@/components/toolbox/add/useLinkFields'
import type { TreePickerTarget } from '@/components/menu/shared/TreePicker'
import { B5Card } from '../B5Card'
import type { QuickAddInitialData } from '../quick-add-types'

export function LinkCardBody({ onClose, initialData }: { onClose: () => void; initialData?: QuickAddInitialData }) {
  const f = useLinkFields()

  useEffect(() => {
    if (initialData?.url) f.setUrl(initialData.url)
    if (initialData?.title) f.setTitle(initialData.title)
    // Prefill once on open only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <B5Card
      title="New Link"
      icon={LinkIcon}
      onClose={onClose}
      onSave={(target: TreePickerTarget) => f.save({ mode: 'workspace', ...target })}
      canSave={f.canSave}
      saving={f.saving}
      successMessage="Link created"
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="qa-link-url">URL</Label>
          <Input
            id="qa-link-url"
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
          <Label htmlFor="qa-link-title">Title</Label>
          <Input
            id="qa-link-title"
            value={f.title}
            onChange={(e) => f.setTitle(e.target.value)}
            placeholder="Optional display title"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Tags</Label>
          <TagInput tags={f.tags} onChange={f.setTags} />
        </div>
      </div>
    </B5Card>
  )
}
