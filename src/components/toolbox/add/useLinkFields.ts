import { useState } from 'react'
import { tagsToFeatures } from './tags'
import { submitDocuments, type AddTarget } from './useAddTarget'
import { useGeotag } from '@/hooks/useGeotag'
import { WEBAPP_TYPE } from './WebAppFields'

// Plain links are stored as tabs (url + title), which the browser extension
// syncs. Web apps are data/schema/link documents with data.type = 'webapp' and
// an optional data.category: launchers, not session tabs, so the extension
// leaves them alone.
const TAB_SCHEMA = 'data/schema/tab'
const TAB_SCHEMA_VERSION = '2.0'
const LINK_SCHEMA = 'data/schema/link'
const LINK_SCHEMA_VERSION = '3.0'

function isValidUrl(value: string): boolean {
  try { new URL(value); return true } catch { return false }
}

// Field state + doc-building + submit for the link abstraction, shared by
// LinkForm (AddPanel sidebar) and LinkCardBody (home FAB B5 card).
export function useLinkFields() {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [webapp, setWebapp] = useState(false)
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const geotag = useGeotag()

  const trimmedUrl = url.trim()
  const urlValid = isValidUrl(trimmedUrl)
  const showUrlError = trimmedUrl.length > 0 && !urlValid
  const canSave = urlValid && !saving

  async function save(target: AddTarget): Promise<number[]> {
    if (!urlValid) throw new Error('Enter a valid URL')
    setSaving(true)
    try {
      // Off by default; capture() resolves null unless the user opted in, and
      // never rejects — a missing fix must not block saving the link.
      const geo = await geotag.capture()
      const cleanTags = tags.map((t) => t.trim()).filter(Boolean)
      const metadata = { features: tagsToFeatures(tags), ...(geo ? { geo } : {}) }
      const doc = webapp
        ? {
            schema: LINK_SCHEMA,
            schemaVersion: LINK_SCHEMA_VERSION,
            data: {
              uri: trimmedUrl,
              type: WEBAPP_TYPE,
              ...(title.trim() ? { label: title.trim() } : {}),
              ...(category.trim() ? { category: category.trim() } : {}),
              ...(cleanTags.length ? { tags: cleanTags } : {}),
            },
            metadata,
          }
        : {
            schema: TAB_SCHEMA,
            schemaVersion: TAB_SCHEMA_VERSION,
            data: {
              url: trimmedUrl,
              ...(title.trim() ? { title: title.trim() } : {}),
              ...(cleanTags.length ? { tags: cleanTags } : {}),
            },
            metadata,
          }
      return await submitDocuments(target, [doc])
    } finally {
      setSaving(false)
    }
  }

  return { url, setUrl, title, setTitle, tags, setTags, webapp, setWebapp, category, setCategory, saving, canSave, urlValid, showUrlError, save, geotag }
}
