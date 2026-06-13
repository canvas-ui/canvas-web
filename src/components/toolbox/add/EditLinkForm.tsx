import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { TagInput } from './TagInput'
import { tagsToFeatures } from './tags'
import { updateWorkspaceDocument } from '@/services/workspace'

function featuresToTags(features: string[] | undefined): string[] {
  return (features || []).filter(f => f.startsWith('tag/')).map(f => f.slice(4))
}

export function EditLinkForm() {
  const { state, closeAdd } = useToolbox()
  const { editDocument: doc, editWorkspaceId: workspaceId } = state
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const [label, setLabel] = useState<string>(doc?.data?.label ?? '')
  const [tags, setTags] = useState<string[]>(
    featuresToTags((doc?.metadata as any)?.features).length
      ? featuresToTags((doc?.metadata as any)?.features)
      : (doc?.data?.tags as string[] | undefined) ?? []
  )
  const [saving, setSaving] = useState(false)

  if (!doc || !workspaceId) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      const cleanTags = tags.map(t => t.trim()).filter(Boolean)
      await updateWorkspaceDocument(workspaceId, {
        id: doc.id,
        schema: doc.schema,
        schemaVersion: doc.schemaVersion,
        data: {
          ...doc.data,
          ...(label.trim() ? { label: label.trim() } : {}),
          tags: cleanTags,
        },
        metadata: { features: tagsToFeatures(tags) },
      })
      showSuccessToast('Link updated')
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to update link')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="space-y-1.5">
        <Label>URL <span className="text-xs text-muted-foreground">(frozen)</span></Label>
        <Input value={doc.data?.uri ?? ''} disabled className="font-mono text-xs" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-link-label">Label</Label>
        <Input
          id="edit-link-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Optional display name"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput tags={tags} onChange={setTags} />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeAdd} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save link'}
        </Button>
      </div>
    </div>
  )
}
