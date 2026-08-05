import { useState } from 'react'
import { tagsToFeatures } from './tags'
import { submitDocuments, type AddTarget } from './useAddTarget'
import { useGeotag } from '@/hooks/useGeotag'

const NOTE_SCHEMA = 'data/schema/note'
const NOTE_SCHEMA_VERSION = '2.0'

// Field state + doc-building + submit for the note abstraction, shared by
// NoteForm (AddPanel sidebar) and NoteCardBody (home FAB B5 card) — the two
// containers differ only in chrome (target source, close/toast handling).
export function useNoteFields() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  // Top-level doc field (BaseDocument.comment) — user-authored context that
  // isn't part of the note body; FTS'd and ticks feature/has-comment. Mirrors
  // the Comment field in the object-card EditForm.
  const [comment, setComment] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const geotag = useGeotag()

  const canSave = content.trim().length > 0 && !saving

  async function save(target: AddTarget): Promise<number[]> {
    setSaving(true)
    try {
      // Off by default; capture() resolves null unless the user opted in, and
      // never rejects — a missing fix must not block saving the note.
      const geo = await geotag.capture()
      const doc = {
        schema: NOTE_SCHEMA,
        schemaVersion: NOTE_SCHEMA_VERSION,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        data: {
          ...(title.trim() ? { title: title.trim() } : {}),
          content,
        },
        metadata: { features: tagsToFeatures(tags), ...(geo ? { geo } : {}) },
      }
      return await submitDocuments(target, [doc])
    } finally {
      setSaving(false)
    }
  }

  return { title, setTitle, content, setContent, comment, setComment, tags, setTags, saving, canSave, save, geotag }
}
