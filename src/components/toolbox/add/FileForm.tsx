import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Upload, File as FileIcon, X, Check, AlertCircle, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../use-toolbox'
import { useAddTarget, describeTarget, resolveUploadWorkspace } from './useAddTarget'
import { useFileFields, buildFileDocument } from './useFileFields'
import { FileMetaFields } from './FileMetaFields'
import { useUploadQueue, type UploadItem } from './useUploadQueue'
import { cn } from '@/lib/utils'

// TODO: copy-to-multiple-backends (workspace:home vs workspace:data) once more
// than one blob backend is exposed server-side — for now every upload goes to
// the workspace's default `workspace:data` blob store.

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

// `capture` turns the form into the Photo/Video variant: the file input asks
// the OS for the camera (mobile) or restricts the picker to media (desktop).
// Upload plumbing is identical either way.
export function FileForm({ capture = false }: { capture?: boolean } = {}) {
  const { closeAdd } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const queue = useUploadQueue()
  const { items, running } = queue

  // Workspace mode already knows where it uploads; only a context has to be
  // resolved to its bound workspace (an API call), and the result is kept keyed
  // by contextId so the workspace name below derives instead of lingering from
  // a previous target.
  const [ctxWorkspace, setCtxWorkspace] = useState<{ contextId: string; workspaceName: string } | null>(null)
  useEffect(() => {
    if (target?.mode !== 'context') return
    let cancelled = false
    resolveUploadWorkspace(target)
      .then((w) => { if (!cancelled) setCtxWorkspace({ contextId: target.contextId, workspaceName: w.workspaceName }) })
      .catch(() => { /* no suggestions */ })
    return () => { cancelled = true }
  }, [target])

  const uploadWorkspace = target?.mode === 'workspace'
    ? target.workspaceName
    : (target && ctxWorkspace?.contextId === target.contextId ? ctxWorkspace.workspaceName : null)
  const meta = useFileFields(uploadWorkspace)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    queue.addFiles(Array.from(list))
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const failed = items.filter((it) => it.status === 'error').length
  const done = items.filter((it) => it.status === 'done').length
  const pending = items.length - done
  const canSubmit = !!target && !running && pending > 0

  const handleSubmit = async () => {
    if (!canSubmit || !target) return
    try {
      // One fix for the whole batch, taken before the uploads start — the
      // same location the user saw in the form, not wherever they are several
      // megabytes later. Resolves null unless they opted in; never rejects.
      const geo = await meta.geotag.capture()
      const summary = await queue.start(target, (blob, file) =>
        buildFileDocument(blob, file, { tags: meta.tags, comment: meta.comment, geo }))
      if (summary.failed === 0) {
        const resumedNote = summary.resumed ? ` (${summary.resumed} already uploaded)` : ''
        showSuccessToast(`${summary.done} file(s) uploaded${resumedNote}`)
        closeAdd()
      } else {
        showErrorToast(`${summary.failed} of ${summary.total} file(s) failed — retry keeps what already made it`)
      }
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to upload files')
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
        <Upload className="h-6 w-6 text-muted-foreground touch-target" />
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
                      onClick={() => queue.removeItem(it.id)}
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

      <FileMetaFields fields={meta} idPrefix="file" multiple={items.length > 1} />

      <p className="text-xs text-muted-foreground">{describeTarget(target)}</p>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => (running ? queue.cancel() : closeAdd())}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          {running
            ? 'Uploading…'
            : failed > 0
              ? (<span className="flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" />Retry failed ({failed})</span>)
              : 'Add files'}
        </Button>
      </div>
    </div>
  )
}
