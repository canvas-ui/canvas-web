import { useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { insertWorkspacePath } from '@/services/workspace'
import { B5Card, type B5SaveTarget } from '../B5Card'

// Quick-add "whole folder": name the folder here, pick where it goes via the
// card's Save / Link to… destination picker (same flow as every other card).
export function FolderCardBody({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const trimmed = name.trim().replace(/^\/+|\/+$/g, '')

  const save = async (target: B5SaveTarget) => {
    setSaving(true)
    try {
      const base = target.path === '/' ? '' : target.path
      await insertWorkspacePath(target.workspaceName, `${base}/${trimmed}`, true, target.treeName)
      // Nothing to link into additional picked paths — a folder is a tree
      // node, not a document.
      return []
    } finally {
      setSaving(false)
    }
  }

  return (
    <B5Card
      title="New Folder"
      icon={FolderPlus}
      onClose={onClose}
      onSave={save}
      canSave={!!trimmed}
      saving={saving}
      successMessage="Folder created"
    >
      <div className="flex h-full flex-col gap-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="qa-folder-name">Folder name</Label>
          <Input
            id="qa-folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. projects/alpha"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Nested paths are created as needed — pick the destination with Save / Link to…
          </p>
        </div>
      </div>
    </B5Card>
  )
}
