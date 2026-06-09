import { useRef, useState, type DragEvent } from 'react'
import { Upload, File as FileIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { useAddTarget, describeTarget } from './useAddTarget'
import { cn } from '@/lib/utils'

// Default storage backends seeded per workspace. The backend-pick step only renders
// when more than one is available. NOTE: wiring is intentionally stubbed — actual
// upload + backend selection lands with file storage support.
// TODO(file-backend): replace with real backend listing + upload once storage lands.
const DEFAULT_BACKENDS = [
  { id: 'workspace:home', label: 'Home', hint: 'workspace_root/home' },
  { id: 'workspace:data', label: 'Data', hint: 'workspace_root/data' },
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileForm() {
  const { closeAdd } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [backends, setBackends] = useState<string[]>(DEFAULT_BACKENDS.map((b) => b.id))
  const [submitting, setSubmitting] = useState(false)

  const multiBackend = DEFAULT_BACKENDS.length > 1

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list)
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`))
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))]
    })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const toggleBackend = (id: string) => {
    setBackends((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]))
  }

  const canSubmit = !!target && !submitting && files.length > 0 && (!multiBackend || backends.length > 0)

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      // TODO(file-backend): POST file blobs to the selected backends and create
      // data/abstraction/file documents referencing the stored locations.
      await new Promise((r) => setTimeout(r, 300))
      showSuccessToast(
        `File upload backend coming soon — ${files.length} file(s) queued for ${backends.join(', ') || 'default'}`,
        'Not yet wired',
      )
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to queue files')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/40',
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm">Drag &amp; drop files here</p>
        <p className="text-xs text-muted-foreground">or click to browse</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5">
          <Label>{files.length} file(s)</Label>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {files.map((f, i) => (
              <li
                key={`${f.name}:${f.size}:${i}`}
                className="flex items-center gap-2 rounded border border-input px-2 py-1 text-sm"
              >
                <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {multiBackend && files.length > 0 && (
        <div className="space-y-1.5">
          <Label>Copy to backends</Label>
          <div className="space-y-1">
            {DEFAULT_BACKENDS.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={backends.includes(b.id)}
                  onChange={() => toggleBackend(b.id)}
                />
                <span>{b.label}</span>
                <span className="text-xs text-muted-foreground">{b.hint}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{describeTarget(target)}</p>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeAdd} disabled={submitting}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? 'Working…' : 'Add files'}
        </Button>
      </div>
    </div>
  )
}
