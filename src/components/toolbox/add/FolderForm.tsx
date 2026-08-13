import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { insertWorkspacePath } from '@/services/workspace'
import { useToolbox } from '../use-toolbox'
import { useAddTarget, describeTarget, resolveUploadWorkspace } from './useAddTarget'

// Creates a folder (tree path) under the current target — workspace mode uses
// the selected tree path directly; context mode resolves the context's bound
// workspace + path first, same as file uploads do.
export function FolderForm() {
  const { closeAdd } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const trimmed = name.trim().replace(/^\/+|\/+$/g, '')
  const canSubmit = !!target && !!trimmed && !submitting

  const handleSubmit = async () => {
    if (!canSubmit || !target) return
    setSubmitting(true)
    try {
      const { workspaceName, path, treeName } = await resolveUploadWorkspace(target)
      const base = path === '/' ? '' : path
      await insertWorkspacePath(workspaceName, `${base}/${trimmed}`, true, treeName)
      showSuccessToast('Folder created')
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to create folder')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="add-folder-name">Folder name</Label>
        <Input
          id="add-folder-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          placeholder="e.g. projects/alpha"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Nested paths are created as needed. Target: {describeTarget(target)}
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeAdd} disabled={submitting}>Cancel</Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? 'Creating…' : 'Create folder'}
        </Button>
      </div>
    </div>
  )
}
