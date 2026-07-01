import { useState } from 'react'
import { tagsToFeatures } from './tags'
import { submitDocuments, type AddTarget } from './useAddTarget'

// Links are stored as tabs for now (schema unification pending a larger
// refactor — Link/Tab share the same shape). Editable fields: url + title.
const TAB_SCHEMA = 'data/abstraction/tab'
const TAB_SCHEMA_VERSION = '2.0'

function isValidUrl(value: string): boolean {
  try { new URL(value); return true } catch { return false }
}

// Field state + doc-building + submit for the link abstraction, shared by
// LinkForm (AddPanel sidebar) and LinkCardBody (home FAB B5 card).
export function useLinkFields() {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const trimmedUrl = url.trim()
  const urlValid = isValidUrl(trimmedUrl)
  const showUrlError = trimmedUrl.length > 0 && !urlValid
  const canSave = urlValid && !saving

  async function save(target: AddTarget): Promise<boolean> {
    if (!urlValid) throw new Error('Enter a valid URL')
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
      return await submitDocuments(target, [doc])
    } finally {
      setSaving(false)
    }
  }

  return { url, setUrl, title, setTitle, tags, setTags, saving, canSave, urlValid, showUrlError, save }
}
