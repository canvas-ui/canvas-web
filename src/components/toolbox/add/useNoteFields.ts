import { useDurableDraft } from '@/hooks/use-durable-draft'
import { draftKey } from '@/lib/durable-draft'
import { updateWorkspaceDocument } from '@/services/workspace'
import { tagsToFeatures } from './tags'
import { submitDocuments, resolveUploadWorkspace, notifyWorkspaceDocumentsChanged, type AddTarget } from './useAddTarget'
import { useGeotag } from '@/hooks/useGeotag'

type NoteFields = { title: string; content: string; comment: string; tags: string[] }
const EMPTY_NOTE: NoteFields = { title: '', content: '', comment: '', tags: [] }

// Bound notes save to the server automatically. Home quick-add has no destination
// yet, so it keeps a durable local draft until the user chooses where to save it.
export function useNoteFields(target?: AddTarget, afterSave?: (ids: number[]) => Promise<unknown>, scope = 'add') {
  const geotag = useGeotag()
  const key = draftKey(`new:${scope}:${target?.mode === 'workspace' ? `${target.workspaceName}:${target.treeName}:${target.path}` : target?.contextId ?? 'home'}`)
  const writer = (destination: AddTarget) => async (value: NoteFields, meta: Record<string, unknown>, checkpoint: (meta: Record<string, unknown>) => void) => {
    const workspace = typeof meta.workspace === 'string' ? meta.workspace : (await resolveUploadWorkspace(destination)).workspaceName
    const geo = await geotag.capture()
    const doc = {
      schema: 'data/schema/note', schemaVersion: '2.0', comment: value.comment,
      data: { title: value.title.trim(), content: value.content },
      metadata: { features: tagsToFeatures(value.tags), ...(geo ? { geo } : {}) },
    }
    let id = typeof meta.id === 'number' ? meta.id : undefined
    if (id == null) {
      const ids = await submitDocuments(destination, [doc], { refresh: false })
      if (!ids.length) throw new Error('The server did not return the saved note')
      id = ids[0]
      // Persist the identity immediately: subsequent edits and manual Save update
      // this note, including after a refresh, instead of creating another copy.
      checkpoint({ id, workspace })
    } else {
      await updateWorkspaceDocument(workspace, { ...doc, id })
    }
    await afterSave?.([id])
    notifyWorkspaceDocumentsChanged(destination)
  }
  const draft = useDurableDraft(key, EMPTY_NOTE, {
    retainAfterSave: true, valid: value => !!value.content.trim(),
    save: target ? writer(target) : undefined,
  })
  async function save(destination: AddTarget): Promise<number[]> {
    await draft.saveWith(writer(destination))
    const id = draft.getSnapshot().meta.id
    if (typeof id !== 'number') throw new Error('Write a note before saving')
    return [id]
  }
  return {
    ...draft.value, status: draft.status, error: draft.error, storageError: draft.storageError,
    setTitle: (title: string) => draft.update({ title }), setContent: (content: string) => draft.update({ content }),
    setComment: (comment: string) => draft.update({ comment }), setTags: (tags: string[]) => draft.update({ tags }),
    saving: draft.status === 'saving', canSave: !!draft.value.content.trim() && draft.status !== 'saving',
    save, finish: draft.clear, retry: draft.flush, geotag,
  }
}
