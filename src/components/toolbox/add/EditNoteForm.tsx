import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { MarkdownEditor } from './MarkdownEditor'
import { TagInput } from './TagInput'
import { tagsToFeatures } from './tags'
import { updateWorkspaceDocument } from '@/services/workspace'

function featuresToTags(features: string[] | undefined): string[] {
  return (features || []).filter(f => f.startsWith('tag/')).map(f => f.slice(4))
}

export function EditNoteForm() {
  const { state, closeAdd } = useToolbox()
  const { editDocument: doc, editWorkspaceId: workspaceId } = state
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const [title, setTitle] = useState<string>(doc?.data?.title ?? '')
  const [content, setContent] = useState<string>(doc?.data?.content ?? '')
  const [tags, setTags] = useState<string[]>(featuresToTags((doc?.metadata as any)?.features))
  const [saving, setSaving] = useState(false)

  if (!doc || !workspaceId) return null

  const canSave = !saving && content.trim().length > 0

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateWorkspaceDocument(workspaceId, {
        id: doc.id,
        schema: doc.schema,
        schemaVersion: doc.schemaVersion,
        data: {
          ...(title.trim() ? { title: title.trim() } : {}),
          content,
        },
        metadata: { features: tagsToFeatures(tags) },
      })
      showSuccessToast('Note updated')
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to update note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="edit-note-title">Title</Label>
        <Input
          id="edit-note-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Optional — defaults to today's date"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Body</Label>
        <MarkdownEditor value={content} onChange={setContent} placeholder="Write your note…" />
      </div>

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput tags={tags} onChange={setTags} />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeAdd} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave}>
          {saving ? 'Saving…' : 'Save note'}
        </Button>
      </div>
    </div>
  )
}
