import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { TagInput } from '@/components/toolbox/add/TagInput'
import { bulkEditDocument } from '@/lib/bulk-edit'
import { DocumentGeoField } from './DocumentGeoField'
import { getWorkspaceDocument, updateWorkspaceDocument } from '@/services/workspace'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import type { DocumentGeo } from '@/types/workspace'

export function BulkEditDialog({ workspaceId, documentIds, onClose }: {
  workspaceId: string; documentIds: number[]; onClose: () => void
}) {
  const [tags, setTags] = useState<string[]>([])
  const [geo, setGeo] = useState<DocumentGeo | null>(null)
  const [commentMode, setCommentMode] = useState<'keep' | 'replace' | 'clear'>('keep')
  const [comment, setComment] = useState('')
  const canSave = (tags.length > 0 || !!geo || commentMode !== 'keep')
    && (commentMode !== 'replace' || comment.trim().length > 0)
  const [pending, setPending] = useState(documentIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEscapeClose(onClose, !saving)
  const save = async () => {
    if (saving || !canSave) return
    setSaving(true)
    setError('')
    const failed: number[] = []
    for (const id of pending) {
      try {
        // Re-read before merging so tags added since selection are retained.
        const doc = await getWorkspaceDocument(workspaceId, id)
        await updateWorkspaceDocument(workspaceId, bulkEditDocument(
          doc, tags, geo, commentMode === 'keep' ? undefined : commentMode === 'clear' ? '' : comment,
        ))
      } catch { failed.push(id) }
    }
    window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
    setSaving(false)
    if (!failed.length) onClose()
    else {
      setPending(failed)
      setError(`${pending.length - failed.length} saved; ${failed.length} could not be updated. Retry applies only to those documents.`)
    }
  }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="bulk-edit-title" className="max-h-viewport-modal overflow-y-auto w-full max-w-md space-y-4 rounded-xl border bg-background p-5 shadow-elevation-4">
        <h2 id="bulk-edit-title" className="font-semibold">Bulk Edit · {pending.length} documents</h2>
        <p className="text-sm text-muted-foreground">Add tags to all selected documents. Choosing a location replaces their existing geotags; leaving it unset keeps them.</p>
        <fieldset disabled={saving} className="space-y-4">
          <div className="space-y-2"><span className="text-sm font-medium">Add tags</span><TagInput tags={tags} onChange={setTags} suggestions={[]} /></div>
          <DocumentGeoField value={geo} onChange={setGeo} idPrefix="bulk-geo" />
          <div className="space-y-2">
            <label htmlFor="bulk-comment-mode" className="text-sm font-medium">Comment</label>
            <select id="bulk-comment-mode" value={commentMode} onChange={e => setCommentMode(e.target.value as typeof commentMode)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="keep">Keep existing comments</option>
              <option value="replace">Replace comments</option>
              <option value="clear">Clear comments</option>
            </select>
            {commentMode === 'replace' && <>
              <label htmlFor="bulk-comment" className="sr-only">New comment for all selected documents</label>
              <textarea id="bulk-comment" rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="Comment for all selected documents…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <p className="text-xs text-muted-foreground">This replaces the comment on every selected document.</p>
            </>}
            {commentMode === 'clear' && <p className="text-xs text-muted-foreground">This removes the comment from every selected document.</p>}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !canSave}>{saving ? 'Saving…' : error ? 'Retry failed' : 'Apply to all'}</Button>
        </div>
      </section>
    </div>, window.document.body,
  )
}
