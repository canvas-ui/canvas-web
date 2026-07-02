import { useState } from 'react'
import { updateWorkspaceDocument } from '@/services/workspace'
import { tagsToFeatures } from './tags'
import type { Document } from '@/types/workspace'

function featuresToTags(features: string[] | undefined): string[] {
  return (features || []).filter(f => f.startsWith('tag/')).map(f => f.slice(4))
}

// Field state + save for editing an existing link, shared by EditLinkForm
// (AddPanel's edit flow) and DocumentSideCard's edit-capable body. The URL
// itself is frozen post-creation (matches EditLinkForm) — only label/tags
// are editable.
export function useEditLinkFields(doc: Document, workspaceId: string) {
  const featureTags = featuresToTags(doc.metadata?.features)
  const [label, setLabel] = useState<string>(String(doc.data?.label ?? ''))
  const [tags, setTags] = useState<string[]>(featureTags.length ? featureTags : ((doc.data?.tags as string[] | undefined) ?? []))
  const [saving, setSaving] = useState(false)

  const canSave = !saving

  async function save(): Promise<void> {
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
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
    } finally {
      setSaving(false)
    }
  }

  return { url: String(doc.data?.uri ?? doc.data?.url ?? ''), label, setLabel, tags, setTags, saving, canSave, save }
}
