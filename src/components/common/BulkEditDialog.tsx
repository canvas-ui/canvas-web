import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { TagInput } from '@/components/toolbox/add/TagInput'
import { bulkEditMetadata } from '@/lib/bulk-edit'
import { DocumentGeoField } from './DocumentGeoField'
import { getWorkspaceDocument, updateWorkspaceDocument } from '@/services/workspace'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import type { DocumentGeo } from '@/types/workspace'

export function BulkEditDialog({ workspaceId, documentIds, onClose }: {
  workspaceId: string; documentIds: number[]; onClose: () => void
}) {
  const [tags, setTags] = useState<string[]>([])
  const [geo, setGeo] = useState<DocumentGeo | null>(null)
  const [pending, setPending] = useState(documentIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEscapeClose(onClose, !saving)
  const save = async () => {
    if (saving || (!tags.length && !geo)) return
    setSaving(true)
    setError('')
    const failed: number[] = []
    for (const id of pending) {
      try {
        // Re-read before merging so tags added since selection are retained.
        const doc = await getWorkspaceDocument(workspaceId, id)
        await updateWorkspaceDocument(workspaceId, {
          id, schema: doc.schema, schemaVersion: doc.schemaVersion,
          metadata: bulkEditMetadata(doc, tags, geo),
        })
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
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || (!tags.length && !geo)}>{saving ? 'Saving…' : error ? 'Retry failed' : 'Apply to all'}</Button>
        </div>
      </section>
    </div>, window.document.body,
  )
}
