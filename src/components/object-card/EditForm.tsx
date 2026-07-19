import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LazyMarkdownEditor } from '@/components/common/lazy-editor'
import { TagInput } from '@/components/toolbox/add/TagInput'
import { tagsToFeatures, featuresToTags } from '@/components/toolbox/add/tags'
import { updateWorkspaceDocument, listWorkspaceTagSuggestions } from '@/services/workspace'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { NOTE_SCHEMA, LINK_SCHEMA, TAB_SCHEMA, TODO_SCHEMA } from '@/components/renderers/types'
import { TodoFields } from '@/components/toolbox/add/TodoFields'
import { buildTodoData, isoToLocalInput, todayEndOfDayLocal, type TodoStatus } from '@/components/toolbox/add/useTodoFields'
import type { Document } from '@/types/workspace'

export function isEditableSchema(schema: string): boolean {
  return schema === NOTE_SCHEMA || schema === LINK_SCHEMA || schema === TAB_SCHEMA || schema === TODO_SCHEMA
}

// Per-schema field mapping for the url/title pair. Legacy links store these as
// uri/label; tabs use url/title. Notes have no url.
function urlTitleKeys(schema: string): { urlKey: string | null; titleKey: string } {
  if (schema === LINK_SCHEMA) return { urlKey: 'uri', titleKey: 'label' }
  if (schema === TAB_SCHEMA) return { urlKey: 'url', titleKey: 'title' }
  return { urlKey: null, titleKey: 'title' }
}

// Inline edit form for note/link/tab documents (ported from the old detail
// modal's DocumentEditForm). Editing a link/tab url upserts the document
// (checksum recalculated) — accepted.
export function DocumentEditForm({ document: doc, workspaceId, onClose }: { document: Document; workspaceId: string; onClose: () => void }) {
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  // Schema-specific fields (url/title/body/tags) only render for note/link/tab.
  // The comment section is universal — every document can carry a user comment,
  // including photos/files that are otherwise not editable.
  const editable = isEditableSchema(doc.schema)
  const isNote = doc.schema === NOTE_SCHEMA
  const isTodo = doc.schema === TODO_SCHEMA
  const { urlKey, titleKey } = urlTitleKeys(doc.schema)

  const [url, setUrl] = useState<string>(urlKey ? String(doc.data?.[urlKey] ?? '') : '')
  const [title, setTitle] = useState<string>(String(doc.data?.[titleKey] ?? ''))
  const [content, setContent] = useState<string>(String(doc.data?.content ?? ''))
  // Todo-specific fields (seeded from the document; dueDate ISO → local input).
  const [description, setDescription] = useState<string>(String(doc.data?.description ?? ''))
  const [status, setStatus] = useState<TodoStatus>((doc.data?.status as TodoStatus) ?? 'pending')
  const [priority, setPriority] = useState<number | ''>(typeof doc.data?.priority === 'number' ? doc.data.priority : '')
  const [due, setDue] = useState<string>(doc.data?.dueDate ? isoToLocalInput(String(doc.data.dueDate)) : todayEndOfDayLocal())
  const [comment, setComment] = useState<string>(String(doc.comment ?? ''))
  const [tags, setTags] = useState<string[]>(
    featuresToTags((doc.metadata as Record<string, unknown>)?.features as string[] | undefined).length
      ? featuresToTags((doc.metadata as Record<string, unknown>)?.features as string[] | undefined)
      : ((doc.data?.tags as string[] | undefined) ?? [])
  )
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    listWorkspaceTagSuggestions(workspaceId).then((s) => { if (!cancelled) setSuggestions(s) }).catch(() => {})
    return () => { cancelled = true }
  }, [workspaceId])

  const urlValid = !urlKey || (() => { try { new URL(url.trim()); return true } catch { return false } })()
  // Non-editable schemas (photos/files) save comment-only, so they're always valid.
  const canSave = !saving && (!editable ? true : (isTodo ? title.trim().length > 0 : (isNote ? content.trim().length > 0 : urlValid)))

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: {
        id: number; schema: string; schemaVersion: string
        comment: string; data?: Record<string, unknown>; metadata?: Record<string, unknown>
      } = {
        id: doc.id,
        schema: doc.schema,
        schemaVersion: doc.schemaVersion,
        comment: comment.trim(),
      }
      // Only send data/metadata for editable schemas — sending `data` would
      // wholesale-replace it (BaseDocument.update), clobbering a photo/file's data.
      if (isTodo) {
        // Preserve other data fields (e.g. completedAt) while updating the editable ones.
        payload.data = { ...doc.data, ...buildTodoData({ title, description, status, priority, due }) }
        payload.metadata = { features: tagsToFeatures(tags) }
      } else if (editable) {
        const cleanTags = tags.map(t => t.trim()).filter(Boolean)
        let data: Record<string, unknown>
        if (isNote) {
          data = { ...(title.trim() ? { title: title.trim() } : {}), content }
        } else {
          data = { ...doc.data }
          if (urlKey) data[urlKey] = url.trim()
          if (title.trim()) data[titleKey] = title.trim(); else delete data[titleKey]
          data.tags = cleanTags
        }
        payload.data = data
        payload.metadata = { features: tagsToFeatures(tags) }
      }
      await updateWorkspaceDocument(workspaceId, payload)
      showSuccessToast('Document updated')
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
      onClose()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to update document')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {editable && urlKey && (
        <div className="space-y-1.5">
          <Label htmlFor="edit-url">URL</Label>
          <Input id="edit-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className="font-mono text-xs" />
          {url.trim() && !urlValid && (<p className="text-xs text-destructive">Enter a valid URL, e.g. https://example.com</p>)}
        </div>
      )}

      {editable && isTodo && (
        <TodoFields
          idPrefix="edit-todo"
          title={title} setTitle={setTitle}
          description={description} setDescription={setDescription}
          status={status} setStatus={setStatus}
          priority={priority} setPriority={setPriority}
          due={due} setDue={setDue}
        />
      )}

      {editable && !isTodo && (
        <div className="space-y-1.5">
          <Label htmlFor="edit-title">Title</Label>
          <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isNote ? "Optional — defaults to today's date" : 'Optional display title'} />
        </div>
      )}

      {editable && isNote && (
        <div className="space-y-1.5">
          <Label>Body</Label>
          <LazyMarkdownEditor value={content} onChange={setContent} placeholder="Write your note…" />
        </div>
      )}

      {editable && (
        <div className="space-y-1.5">
          <Label>Tags</Label>
          <TagInput tags={tags} onChange={setTags} suggestions={suggestions} />
        </div>
      )}

      {/* Universal: every document can carry a user-authored comment. */}
      <div className="space-y-1.5">
        <Label htmlFor="edit-comment">Comment</Label>
        <textarea
          id="edit-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Add context you can't infer from the content — e.g. “sofa from the cozmo bar in Košice”"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </div>
  )
}
