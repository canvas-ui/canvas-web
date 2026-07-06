import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LazyMarkdownEditor } from '@/components/common/lazy-editor'
import { TagInput } from '@/components/toolbox/add/TagInput'
import { tagsToFeatures, featuresToTags } from '@/components/toolbox/add/tags'
import { updateWorkspaceDocument, listWorkspaceTagSuggestions } from '@/services/workspace'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { NOTE_SCHEMA, LINK_SCHEMA, TAB_SCHEMA } from '@/components/renderers/types'
import type { Document } from '@/types/workspace'

export function isEditableSchema(schema: string): boolean {
  return schema === NOTE_SCHEMA || schema === LINK_SCHEMA || schema === TAB_SCHEMA
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
  const isNote = doc.schema === NOTE_SCHEMA
  const { urlKey, titleKey } = urlTitleKeys(doc.schema)

  const [url, setUrl] = useState<string>(urlKey ? String(doc.data?.[urlKey] ?? '') : '')
  const [title, setTitle] = useState<string>(String(doc.data?.[titleKey] ?? ''))
  const [content, setContent] = useState<string>(String(doc.data?.content ?? ''))
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
  const canSave = !saving && (isNote ? content.trim().length > 0 : urlValid)

  const handleSave = async () => {
    setSaving(true)
    try {
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
      await updateWorkspaceDocument(workspaceId, {
        id: doc.id,
        schema: doc.schema,
        schemaVersion: doc.schemaVersion,
        data,
        metadata: { features: tagsToFeatures(tags) },
      })
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
      {urlKey && (
        <div className="space-y-1.5">
          <Label htmlFor="edit-url">URL</Label>
          <Input id="edit-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className="font-mono text-xs" />
          {url.trim() && !urlValid && (<p className="text-xs text-destructive">Enter a valid URL, e.g. https://example.com</p>)}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="edit-title">Title</Label>
        <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isNote ? "Optional — defaults to today's date" : 'Optional display title'} />
      </div>

      {isNote && (
        <div className="space-y-1.5">
          <Label>Body</Label>
          <LazyMarkdownEditor value={content} onChange={setContent} placeholder="Write your note…" />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput tags={tags} onChange={setTags} suggestions={suggestions} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </div>
  )
}
