import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DocumentBodyEditor } from '@/components/common/DocumentBodyEditor'
import { backendUploadKey } from '@/lib/backend-upload'
import { writeBackendObject } from '@/services/blobs'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../use-toolbox'
import { useAddTarget, resolveBackendUpload, notifyWorkspaceDocumentsChanged } from './useAddTarget'

export function PlaintextFileForm() {
  const target = useAddTarget()
  const { closeAdd } = useToolbox()
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const [filename, setFilename] = useState('Untitled.txt')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  let validName = false
  try { backendUploadKey('', filename.trim()); validName = true } catch { /* Invalid filename. */ }
  const save = async () => {
    if (saving || !validName || target?.mode !== 'workspace' || target.treeName !== 'backends') return
    setSaving(true)
    try {
      const backend = await resolveBackendUpload(target.workspaceName, target.path)
      await writeBackendObject(target.workspaceName, { ...backend, key: backendUploadKey(backend.key, filename.trim()) },
        new Blob([content], { type: 'text/plain;charset=utf-8' }), { contentType: 'text/plain;charset=utf-8' })
      notifyWorkspaceDocumentsChanged(target)
      window.dispatchEvent(new CustomEvent('workspace:tree:refresh'))
      showSuccessToast('Plaintext file created')
      closeAdd()
    } catch (cause) { showErrorToast(cause instanceof Error ? cause.message : 'Failed to create file') }
    finally { setSaving(false) }
  }
  return <div className="flex flex-col gap-4 p-4">
    <div className="space-y-1.5"><Label htmlFor="plaintext-filename">Filename</Label><Input id="plaintext-filename" autoFocus value={filename} onChange={event => setFilename(event.target.value)} /></div>
    <div className="space-y-1.5"><Label>Content</Label><DocumentBodyEditor kind="text" value={content} onChange={setContent} placeholder="Write plain text…" /></div>
    <p className="text-xs text-muted-foreground">Creates a file in the current storage folder. Existing files are never overwritten.</p>
    <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={closeAdd} disabled={saving}>Cancel</Button><Button size="sm" onClick={save} disabled={saving || !validName}>{saving ? 'Creating…' : 'Create file'}</Button></div>
  </div>
}
