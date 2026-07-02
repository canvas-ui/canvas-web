import { useState } from 'react'
import { updateWorkspaceDocument } from '@/services/workspace'
import { tagsToFeatures } from './tags'
import type { Document } from '@/types/workspace'

function featuresToTags(features: string[] | undefined): string[] {
  return (features || []).filter(f => f.startsWith('tag/')).map(f => f.slice(4))
}

// Field state + save for editing an existing note, shared by EditNoteForm
// (AddPanel's edit flow) and DocumentSideCard's edit-capable body.
export function useEditNoteFields(doc: Document, workspaceId: string) {
  const [title, setTitle] = useState<string>(String(doc.data?.title ?? ''))
  const [content, setContent] = useState<string>(String(doc.data?.content ?? ''))
  const [tags, setTags] = useState<string[]>(featuresToTags(doc.metadata?.features))
  const [saving, setSaving] = useState(false)

  const canSave = content.trim().length > 0 && !saving

  async function save(): Promise<void> {
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
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
    } finally {
      setSaving(false)
    }
  }

  return { title, setTitle, content, setContent, tags, setTags, saving, canSave, save }
}
