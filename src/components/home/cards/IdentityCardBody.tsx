import { useEffect } from 'react'
import { User } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { useIdentityFields } from '@/components/toolbox/add/useIdentityFields'
import { IdentityFields } from '@/components/toolbox/add/IdentityFields'
import { TagInput } from '@/components/toolbox/add/TagInput'
import { B5Card, type B5SaveTarget } from '../B5Card'
import type { QuickAddInitialData } from '../quick-add-types'

export function IdentityCardBody({ onClose, initialData }: { onClose: () => void; initialData?: QuickAddInitialData }) {
  const f = useIdentityFields()

  useEffect(() => {
    if (initialData?.title) f.setDisplayName(initialData.title)
    // Prefill once on open only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <B5Card
      title="New Identity"
      icon={User}
      onClose={onClose}
      onSave={(target: B5SaveTarget) => f.save({ mode: 'workspace', ...target })}
      canSave={f.canSave}
      saving={f.saving}
      successMessage="Identity created"
    >
      <div className="flex h-full flex-col gap-4 p-4">
        <IdentityFields idPrefix="qa-identity" {...f} emailValid={f.emailValid} />
        <div className="space-y-1.5">
          <Label>Tags</Label>
          <TagInput tags={f.tags} onChange={f.setTags} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qa-identity-comment">Comment</Label>
          <textarea
            id="qa-identity-comment"
            value={f.comment}
            onChange={(e) => f.setComment(e.target.value)}
            rows={3}
            placeholder="How you know them, where they came from…"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-elevation-1 transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>
    </B5Card>
  )
}
