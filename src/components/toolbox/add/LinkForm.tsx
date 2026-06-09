import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { TagInput } from './TagInput'
import { tagsToFeatures } from './tags'
import { useAddTarget, submitDocuments, describeTarget } from './useAddTarget'

const LINK_SCHEMA = 'data/abstraction/link'
const LINK_SCHEMA_VERSION = '1.0'
// Mirror of the server-side scheme check in schemas/abstractions/Link.js
const URI_SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

export function LinkForm() {
  const { closeAdd } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const [uri, setUri] = useState('')
  const [label, setLabel] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const trimmedUri = uri.trim()
  const uriValid = URI_SCHEME_REGEX.test(trimmedUri)
  const showUriError = trimmedUri.length > 0 && !uriValid
  const canSave = !!target && !saving && uriValid

  const handleSave = async () => {
    if (!target || !uriValid) return
    setSaving(true)
    try {
      const cleanTags = tags.map((t) => t.trim()).filter(Boolean)
      const doc = {
        schema: LINK_SCHEMA,
        schemaVersion: LINK_SCHEMA_VERSION,
        data: {
          uri: trimmedUri,
          ...(label.trim() ? { label: label.trim() } : {}),
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
        <Label htmlFor="link-uri">URL</Label>
        <Input
          id="link-uri"
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          placeholder="https://example.com"
          autoFocus
        />
        {showUriError && (
          <p className="text-xs text-destructive">URL must include a scheme, e.g. https://</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="link-label">Label</Label>
        <Input
          id="link-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Optional display name"
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
