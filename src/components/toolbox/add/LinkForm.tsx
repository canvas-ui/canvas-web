import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { TagInput } from './TagInput'
import { tagsToFeatures } from './tags'
import { useAddTarget, submitDocuments, describeTarget } from './useAddTarget'

// Links are stored as tabs for now (schema unification pending a larger
// refactor — Link/Tab share the same shape). Editable fields: url + title.
const TAB_SCHEMA = 'data/abstraction/tab'
const TAB_SCHEMA_VERSION = '2.0'

function isValidUrl(value: string): boolean {
  try { new URL(value); return true } catch { return false }
}

export function LinkForm() {
  const { closeAdd } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const trimmedUrl = url.trim()
  const urlValid = isValidUrl(trimmedUrl)
  const showUrlError = trimmedUrl.length > 0 && !urlValid
  const canSave = !!target && !saving && urlValid

  const handleSave = async () => {
    if (!target || !urlValid) return
    setSaving(true)
    try {
      const cleanTags = tags.map((t) => t.trim()).filter(Boolean)
      const doc = {
        schema: TAB_SCHEMA,
        schemaVersion: TAB_SCHEMA_VERSION,
        data: {
          url: trimmedUrl,
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(cleanTags.length ? { tags: cleanTags } : {}),
        },
        metadata: { features: tagsToFeatures(tags) },
      }
      await submitDocuments(target, [doc])
      showSuccessToast('Link created')
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to create link')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="link-url">URL</Label>
        <Input
          id="link-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          autoFocus
        />
        {showUrlError && (
          <p className="text-xs text-destructive">Enter a valid URL, e.g. https://example.com</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="link-title">Title</Label>
        <Input
          id="link-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Optional display title"
        />
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
          {saving ? 'Saving…' : 'Save link'}
        </Button>
      </div>
    </div>
  )
}
