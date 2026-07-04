import { useRef, useState, type DragEvent } from 'react'
import { Upload, File as FileIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { useAddTarget, describeTarget, submitDocuments, resolveUploadWorkspace } from './useAddTarget'
import { uploadWorkspaceBlob } from '@/services/blobs'
import { cn } from '@/lib/utils'

// TODO: copy-to-multiple-backends (workspace:home vs workspace:data) once more
// than one blob backend is exposed server-side — for now every upload goes to
// the workspace's default `workspace:data` blob store.

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// `capture` turns the form into the Photo/Video variant: the file input asks
// the OS for the camera (mobile) or restricts the picker to media (desktop).
// Upload plumbing is identical either way.
export function FileForm({ capture = false }: { capture?: boolean } = {}) {
  const { closeAdd } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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

  const canSubmit = !!target && !submitting && files.length > 0

  const handleSubmit = async () => {
    if (!canSubmit || !target) return
    setSubmitting(true)
    try {
      const { workspaceName } = await resolveUploadWorkspace(target)
      const docs = []
      for (const file of files) {
        const blob = await uploadWorkspaceBlob(workspaceName, file)
        docs.push({
          schema: 'data/abstraction/file',
          schemaVersion: '3.0',
          data: {},
          checksumArray: [`sha256/${blob.checksum}`],
          locations: [{ url: blob.url, metadata: { filename: file.name } }],
          metadata: { contentType: file.type, size: blob.size },
        })
      }
      await submitDocuments(target, docs)
      showSuccessToast(`${files.length} file(s) uploaded`)
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to upload files')
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
        <p className="text-sm">{capture ? 'Take a photo or video' : 'Drag & drop files here'}</p>
        <p className="text-xs text-muted-foreground">{capture ? 'click to open the camera' : 'or click to browse'}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={capture ? 'image/*,video/*' : undefined}
          capture={capture ? 'environment' : undefined}
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

      <p className="text-xs text-muted-foreground">{describeTarget(target)}</p>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeAdd} disabled={submitting}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? 'Uploading…' : 'Add files'}
        </Button>
      </div>
    </div>
  )
}
