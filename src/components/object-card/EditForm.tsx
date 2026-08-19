import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LazyMarkdownEditor } from '@/components/common/lazy-editor'
import { TagInput } from '@/components/toolbox/add/TagInput'
import { tagsToFeatures, featuresToTags } from '@/components/toolbox/add/tags'
import {
  updateWorkspaceDocument, listWorkspaceTagSuggestions,
  getDocumentRelations, createDocumentRelations, removeDocumentRelation,
} from '@/services/workspace'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { NOTE_SCHEMA, LINK_SCHEMA, TAB_SCHEMA, TODO_SCHEMA, IDENTITY_SCHEMA } from '@/components/renderers/types'
import { DocumentGeoField } from '@/components/common/DocumentGeoField'
import { TodoFields } from '@/components/toolbox/add/TodoFields'
import { IdentityFields } from '@/components/toolbox/add/IdentityFields'
import { useIdentityFields, identityFieldsFromDocument, buildIdentityData } from '@/components/toolbox/add/useIdentityFields'
import { buildTodoData, isoToLocalInput, todayEndOfDayLocal, type TodoStatus } from '@/components/toolbox/add/useTodoFields'
import type { Document, DocumentGeo } from '@/types/workspace'
import { isEditableSchema } from './editable-schema'

// Per-schema field mapping for the url/title pair. Legacy links store these as
// uri/label; tabs use url/title. Notes have no url.
function urlTitleKeys(schema: string): { urlKey: string | null; titleKey: string } {
  if (schema === LINK_SCHEMA) return { urlKey: 'uri', titleKey: 'label' }
  if (schema === TAB_SCHEMA) return { urlKey: 'url', titleKey: 'title' }
  return { urlKey: null, titleKey: 'title' }
}

/**
 * Bring the document's `member-of` edges in line with the organization rows.
 *
 * A DIFF, not a rewrite: only rows picked from the dropdown carry an
 * identityId, and only edges this form is responsible for are touched — a
 * `member-of` an extractor asserted later would still be dropped here, which is
 * why the merge/extraction phase will want provenance-aware handling. Failures
 * are logged, never thrown: the document itself is already saved.
 */
async function syncOrganizationEdges(workspaceId: string, documentId: number, organizations: { identityId?: number }[]) {
  try {
    const wanted = new Set(organizations.map((o) => o.identityId).filter(Boolean) as number[])
    const current = await getDocumentRelations(workspaceId, documentId, { resolve: false })
    const existing = new Set(current.outgoing.filter((r) => r.p === 'member-of').map((r) => r.to as number))

    for (const id of wanted) {
      if (!existing.has(id)) await createDocumentRelations(workspaceId, documentId, 'member-of', [id])
    }
    for (const id of existing) {
      if (!wanted.has(id)) await removeDocumentRelation(workspaceId, documentId, 'member-of', id)
    }
  } catch (err) {
    console.error('Failed to sync organization relations', err)
  }
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
  const isIdentity = doc.schema === IDENTITY_SCHEMA
  const { urlKey, titleKey } = urlTitleKeys(doc.schema)

  const [url, setUrl] = useState<string>(urlKey ? String(doc.data?.[urlKey] ?? '') : '')
  const [title, setTitle] = useState<string>(String(doc.data?.[titleKey] ?? ''))
  const [content, setContent] = useState<string>(String(doc.data?.content ?? ''))
  // Todo-specific fields (seeded from the document; dueDate ISO → local input).
  const [description, setDescription] = useState<string>(String(doc.data?.description ?? ''))
  const [status, setStatus] = useState<TodoStatus>((doc.data?.status as TodoStatus) ?? 'pending')
  const [priority, setPriority] = useState<number | ''>(typeof doc.data?.priority === 'number' ? doc.data.priority : '')
  const [due, setDue] = useState<string>(doc.data?.dueDate ? isoToLocalInput(String(doc.data.dueDate)) : todayEndOfDayLocal())
  // Hooks cannot be conditional, so identity state is always created; it is
  // only read (and only saved) on an identity document.
  const identity = useIdentityFields(identityFieldsFromDocument(doc.data))
  const [comment, setComment] = useState<string>(String(doc.comment ?? ''))
  // Location is universal (like the comment), not schema-specific: a photo with
  // no EXIF fix is the main reason this exists. The patch below is sent only
  // when it actually changed, so an unrelated edit never rewrites metadata.geo.
  const initialGeo = ((doc.metadata as Record<string, unknown> | undefined)?.geo as DocumentGeo | undefined) ?? null
  const [geo, setGeo] = useState<DocumentGeo | null>(initialGeo)
  const geoChanged = JSON.stringify(geo ?? null) !== JSON.stringify(initialGeo ?? null)
  // Features live at the document's TOP LEVEL since synapsd v3 — reading them
  // from `metadata` (where every add surface still WRITES them, and where
  // Document.update still accepts them) always came back empty, so the form
  // opened with no tags and saving replaced the real ones with []. Read both,
  // newest home first.
  const storedFeatures = (doc.features ?? (doc.metadata as Record<string, unknown>)?.features) as string[] | undefined
  const [tags, setTags] = useState<string[]>(
    featuresToTags(storedFeatures).length
      ? featuresToTags(storedFeatures)
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
  const canSave = !saving && (!editable
    ? true
    : isIdentity ? (identity.displayName.trim().length > 0 && identity.emailValid)
    : isTodo ? title.trim().length > 0
    : isNote ? content.trim().length > 0
    : urlValid)

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
      if (isIdentity) {
        // Spread the stored data first: the form does not surface links,
        // properties, timezone, locale or lastInteractionAt, and `data` is
        // REPLACED wholesale server-side — dropping the spread would delete
        // whatever a connector or the extraction pass wrote there.
        payload.data = { ...doc.data, ...buildIdentityData(identity.values) }
        payload.metadata = { features: tagsToFeatures(tags) }
      } else if (isTodo) {
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
      // metadata is a shallow-MERGE patch server-side (Document.update), so
      // sending geo alone is safe even on a photo — contentType/size/exif and
      // the rest of the object survive. null un-indexes it from the geo index.
      if (geoChanged) payload.metadata = { ...(payload.metadata ?? {}), geo }
      await updateWorkspaceDocument(workspaceId, payload)
      if (isIdentity) await syncOrganizationEdges(workspaceId, doc.id, identity.values.organizations)
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

      {editable && isIdentity && (
        <IdentityFields idPrefix="edit-identity" workspaceName={workspaceId} {...identity} emailValid={identity.emailValid} />
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

      {editable && !isTodo && !isIdentity && (
        <div className="space-y-1.5">
          <Label htmlFor="edit-title">Title</Label>
          <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isNote ? "Optional; defaults to today's date" : 'Optional display title'} />
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

      {/* Universal: any document can carry a location, whatever its schema. */}
      <DocumentGeoField value={geo} onChange={setGeo} />

      {/* Universal: every document can carry a user-authored comment. */}
      <div className="space-y-1.5">
        <Label htmlFor="edit-comment">Comment</Label>
        <textarea
          id="edit-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Add context you can't infer from the content, e.g. “sofa from the cozmo bar in Košice”"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-elevation-1 transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </div>
  )
}
