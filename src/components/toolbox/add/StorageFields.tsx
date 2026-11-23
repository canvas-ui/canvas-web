import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supportsBackendFolders } from '@/lib/backend-folders'
import type { Backend } from '@/services/workspace'
import type { StorageFields as Fields } from './useStorageFields'

const title = (backend: Backend) => {
  const label = backend.config?.label
  return typeof label === 'string' && label ? label : `${backend.driver} · ${backend.address}`
}

/**
 * "Upload to": the workspace's own storage, or a backend that takes the files
 * directly. What a backend offers (a folder) follows its capabilities. Hidden
 * while the workspace has no such backend.
 */
export function StorageFields({ fields: f, idPrefix }: { fields: Fields; idPrefix: string }) {
  if (!f.backends.length) return null
  const foldered = f.selected && supportsBackendFolders(f.selected)
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-store`}>Upload to</Label>
      <select
        id={`${idPrefix}-store`}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={f.selected?.address ?? ''}
        onChange={(event) => f.select(event.target.value || null)}
      >
        <option value="">Workspace storage (default)</option>
        {f.backends.map((backend) => <option key={backend.address} value={backend.address}>{title(backend)}</option>)}
      </select>
      {foldered && (
        <Input
          aria-label="Folder on the backend" placeholder="Folder (empty for the top folder)"
          value={f.folder} onChange={(event) => f.setFolder(event.target.value)}
        />
      )}
      {f.selected && (
        <p className="text-xs text-muted-foreground">
          Files are written straight to {title(f.selected)} and listed here; workspace storage keeps no copy. A taken name gets a number.
        </p>
      )}
    </div>
  )
}
