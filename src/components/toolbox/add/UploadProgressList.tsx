import { File as FileIcon, X, Check, AlertCircle, Loader2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { UploadItem } from './useUploadQueue'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusLabel(item: UploadItem): string {
  switch (item.status) {
    case 'hashing': return 'hashing'
    case 'checking': return 'checking'
    case 'uploading': return `${Math.round(item.progress * 100)}%`
    case 'linking': return 'saving'
    case 'done': return item.resumed ? 'already uploaded' : 'done'
    case 'error': return item.error || 'failed'
    default: return formatSize(item.file.size)
  }
}

function StatusIcon({ item }: { item: UploadItem }) {
  switch (item.status) {
    case 'done':
      return <Check className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-500" />
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
    case 'queued':
      return <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    default:
      return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
  }
}

// Thin per-file progress track under the filename row. Hashing shows the read
// fraction, uploading the sent fraction; done/error snap to full.
function ProgressBar({ item }: { item: UploadItem }) {
  const active = item.status !== 'queued'
  if (!active) return null
  const fraction = item.status === 'done' || item.status === 'error' || item.status === 'linking'
    ? 1
    : item.status === 'checking' ? 0 : item.progress
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-200',
          item.status === 'error' ? 'bg-destructive' : item.status === 'done' ? 'bg-green-600 dark:bg-green-500' : 'bg-primary',
        )}
        style={{ width: `${Math.round(fraction * 100)}%` }}
      />
    </div>
  )
}

export function UploadProgressList({ items, running, onRemove }: { items: UploadItem[]; running: boolean; onRemove: (id: string) => void }) {
  const done = items.filter((it) => it.status === 'done').length
  const failed = items.filter((it) => it.status === 'error').length
  return (<>
      {items.length > 0 && (
        <div className="space-y-1.5">
          <Label>
            {items.length} file(s)
            {done > 0 && <span className="ml-1 text-muted-foreground">— {done} done{failed > 0 ? `, ${failed} failed` : ''}</span>}
          </Label>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex flex-col gap-1 rounded border border-input px-2 py-1 text-sm"
              >
                <div className="flex items-center gap-2">
                  <StatusIcon item={it} />
                  <span className="flex-1 truncate" title={it.file.name}>{it.file.name}</span>
                  <span
                    className={cn(
                      'shrink-0 text-xs',
                      it.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
                    )}
                    title={it.status === 'error' ? it.error : undefined}
                  >
                    {statusLabel(it)}
                  </span>
                  {!running && it.status !== 'done' && (
                    <button
                      type="button"
                      onClick={() => onRemove(it.id)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${it.file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <ProgressBar item={it} />
              </li>
            ))}
          </ul>
        </div>
      )}
  </>)
}

export function UploadProgressPanel({ items, running, onCancel }: { items: UploadItem[]; running: boolean; onCancel: () => void }) {
  return <div className="space-y-4 overflow-y-auto p-4">
    <h2 className="text-sm font-medium">Uploading files</h2>
    {!running && <p role="status" className="text-sm text-muted-foreground">Preparing / finishing upload…</p>}
    <UploadProgressList items={items} running onRemove={() => {}} />
    <Button variant="outline" size="sm" disabled={!running} onClick={onCancel}>Cancel upload</Button>
  </div>
}
