import { updateWorkspaceDocument } from '@/services/workspace'
import { useDurableDraft } from '@/hooks/use-durable-draft'
import { draftKey } from '@/lib/durable-draft'
import { tagsToFeatures, featuresToTags } from './tags'
import type { Document, DocumentGeo } from '@/types/workspace'

export function useEditNoteFields(doc: Document, workspaceId: string, enabled = true) {
  const features = (doc.features ?? doc.metadata?.features ?? []) as string[]
  const initial = {
    title: String(doc.data?.title ?? ''), content: String(doc.data?.content ?? ''),
    comment: String(doc.comment ?? ''), tags: featuresToTags(features),
    geo: (doc.metadata?.geo as DocumentGeo | undefined) ?? null,
  }
  const draft = useDurableDraft(draftKey(`document:${workspaceId}:${doc.id}`), initial, {
    save: enabled ? async value => {
      await updateWorkspaceDocument(workspaceId, {
        id: doc.id, schema: doc.schema, schemaVersion: doc.schemaVersion,
        data: { ...doc.data, title: value.title.trim(), content: value.content },
        comment: value.comment,
        metadata: {
          features: [...features.filter(feature => !feature.startsWith('tag/')), ...tagsToFeatures(value.tags)],
          geo: value.geo,
        },
      })
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
    } : undefined,
  })
  return {
    ...draft.value, status: draft.status, error: draft.error, storageError: draft.storageError,
    setTitle: (title: string) => draft.update({ title }),
    setContent: (content: string) => draft.update({ content }),
    setComment: (comment: string) => draft.update({ comment }),
    setTags: (tags: string[]) => draft.update({ tags }),
    setGeo: (geo: DocumentGeo | null) => draft.update({ geo }),
    saving: draft.status === 'saving', canSave: draft.status !== 'saving',
    save: draft.flush,
  }
}
