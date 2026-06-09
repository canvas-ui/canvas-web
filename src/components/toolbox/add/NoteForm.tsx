import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { MarkdownEditor } from './MarkdownEditor'
import { TagInput } from './TagInput'
import { tagsToFeatures } from './tags'
import { useAddTarget, submitDocuments, describeTarget } from './useAddTarget'

const NOTE_SCHEMA = 'data/abstraction/note'
const NOTE_SCHEMA_VERSION = '2.0'

export function NoteForm() {
  const { closeAdd } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const canSave = !!target && !saving && content.trim().length > 0

  const handleSave = async () => {
    if (!target) return
    setSaving(true)
    try {
      const doc = {
        schema: NOTE_SCHEMA,
        schemaVersion: NOTE_SCHEMA_VERSION,
        data: {
          ...(title.trim() ? { title: title.trim() } : {}),
          content,
        },
        metadata: { features: tagsToFeatures(tags) },
      }
      await submitDocuments(target, [doc])
      showSuccessToast('Note created')
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to create note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="note-title">Title</Label>
        <Input
          id="note-title"
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

      <p className="text-xs text-muted-foreground">{describeTarget(target)}</p>

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
