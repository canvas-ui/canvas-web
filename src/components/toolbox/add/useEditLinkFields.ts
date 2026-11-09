import { useState } from 'react'
import { updateWorkspaceDocument } from '@/services/workspace'
import { tagsToFeatures, featuresToTags } from './tags'
import type { Document } from '@/types/workspace'
import { WEBAPP_TYPE } from './WebAppFields'

// Field state + save for editing an existing link, shared by EditLinkForm
// (AddPanel's edit flow) and DocumentSideCard's edit-capable body. The URL
// itself is frozen post-creation (matches EditLinkForm); label, tags, the
// web-app flag (data.type) and data.category are editable.
export function useEditLinkFields(doc: Document, workspaceId: string) {
  const featureTags = featuresToTags(doc.metadata?.features)
  const [label, setLabel] = useState<string>(String(doc.data?.label ?? ''))
  const [tags, setTags] = useState<string[]>(featureTags.length ? featureTags : ((doc.data?.tags as string[] | undefined) ?? []))
  const [webapp, setWebapp] = useState<boolean>(doc.data?.type === WEBAPP_TYPE)
  const [category, setCategory] = useState<string>(String(doc.data?.category ?? ''))
  const [saving, setSaving] = useState(false)

  const canSave = !saving

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const cleanTags = tags.map(t => t.trim()).filter(Boolean)
      // Clearing a field removes it, which unticks its facet; only a type this
      // form owns ('webapp') is cleared, any other type is kept as is.
      const { type: prevType, category: _prevCategory, ...rest } = (doc.data ?? {}) as Record<string, unknown>
      const type = webapp ? WEBAPP_TYPE : (prevType === WEBAPP_TYPE ? undefined : prevType)
      await updateWorkspaceDocument(workspaceId, {
        id: doc.id,
        schema: doc.schema,
        schemaVersion: doc.schemaVersion,
        data: {
          ...rest,
          ...(label.trim() ? { label: label.trim() } : {}),
          ...(type ? { type } : {}),
          ...(category.trim() ? { category: category.trim() } : {}),
          tags: cleanTags,
        },
        metadata: { features: tagsToFeatures(tags) },
      })
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
    } finally {
      setSaving(false)
    }
  }

  return { url: String(doc.data?.uri ?? doc.data?.url ?? ''), label, setLabel, tags, setTags, webapp, setWebapp, category, setCategory, saving, canSave, save }
}
