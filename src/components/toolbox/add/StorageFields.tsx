import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { supportsBackendFolders } from '@/lib/backend-folders'
import { DEFAULT_UPLOAD_STORE, type StorageFields as Fields } from './useStorageFields'

const title = (address: string, label: unknown) =>
  address === DEFAULT_UPLOAD_STORE ? 'Workspace data (default)' : (typeof label === 'string' && label) || address

/** "Store in": which backends keep the uploaded files. Hidden while the default store is the only choice. */
export function StorageFields({ fields: f }: { fields: Fields }) {
  if (f.backends.length < 2) return null
  const picked = f.backends.filter((b) => f.selected.has(b.address))
  const foldered = picked.filter((b) => supportsBackendFolders(b))
  const released = !f.selected.has(DEFAULT_UPLOAD_STORE)
  return (
    <div className="space-y-1.5">
      <Label>Store in</Label>
      <div className="flex flex-wrap gap-1.5">
        {f.backends.map((backend) => {
          const on = f.selected.has(backend.address)
          return (
            <button
              key={backend.address} type="button" aria-pressed={on} onClick={() => f.toggle(backend.address)}
              title={backend.address}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                on ? 'border-primary bg-primary/10 text-foreground' : 'border-input text-muted-foreground hover:bg-muted/40',
              )}
            >
              {title(backend.address, backend.config?.label)}
            </button>
          )
        })}
      </div>
      {(foldered.length > 0 || released) && (
        <p className="text-xs text-muted-foreground">
          {foldered.length > 0 && `${foldered.map((b) => title(b.address, b.config?.label)).join(', ')}: files go to ${f.folder ? `/${f.folder}` : 'the top folder'}; a taken name gets a number. `}
          {released && 'The upload passes through workspace data and is removed from it once the copy is safe.'}
        </p>
      )}
    </div>
  )
}
