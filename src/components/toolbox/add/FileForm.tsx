import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../use-toolbox'
import { useRelationFields } from './useRelationFields'
import { RelationFields } from './RelationFields'
import { useAddTarget, describeTarget, resolveUploadWorkspace } from './useAddTarget'
import { useFileFields, buildFileDocument } from './useFileFields'
import { FileMetaFields } from './FileMetaFields'
import { useStorageFields } from './useStorageFields'
import { StorageFields } from './StorageFields'
import { useUploadQueue } from './useUploadQueue'
import { enqueueUpload } from './upload-manager'
import { UploadProgressList } from './UploadProgressList'
import { cn } from '@/lib/utils'

// `capture` turns the form into the Photo/Video variant: the file input asks
// the OS for the camera (mobile) or restricts the picker to media (desktop).
// Upload plumbing is identical either way. The form only collects files and
// their metadata: submitting hands the batch to the background upload manager
// and closes, so the upload outlives this panel and the folder it started in.
export function FileForm({ capture = false }: { capture?: boolean } = {}) {
  const { closeAdd, state } = useToolbox()
  const target = useAddTarget()
  const isBackend = target?.mode === 'workspace' && target.treeName === 'backends'
  const rel = useRelationFields(target, state.addRelateTo)
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const queue = useUploadQueue()
  const { items } = queue
  const [submitting, setSubmitting] = useState(false)

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
  // A backends-tree folder already names its backend; only virtual trees choose.
  const store = useStorageFields(isBackend ? null : uploadWorkspace, target)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    queue.addFiles(Array.from(list))
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const canSubmit = !!target && !submitting && items.length > 0

  const handleSubmit = async () => {
    if (!canSubmit || !target) return
    setSubmitting(true)
    try {
      // One fix for the whole batch, taken before the uploads start — the
      // same location the user saw in the form, not wherever they are several
      // megabytes later. Resolves null unless they opted in; never rejects.
      const geo = isBackend ? null : await meta.geotag.capture()
      const { tags, comment } = meta
      enqueueUpload(items.map((it) => it.file), target, {
        buildDoc: (blob, file) => buildFileDocument(blob, file, { tags, comment, geo }),
        storage: isBackend ? null : store.storage,
        onSettled: async (summary) => {
          const relFailed = await rel.write(summary.docIds)
          if (relFailed) showErrorToast('Files uploaded, but some relations failed')
          else if (summary.failed === 0) showSuccessToast(`${summary.done} file(s) uploaded`)
        },
      })
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to upload files')
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

      <UploadProgressList items={items} running={false} onRemove={queue.removeItem} />

      {!isBackend && <FileMetaFields fields={meta} idPrefix="file" multiple={items.length > 1} />}

      {!isBackend && <StorageFields fields={store} />}

      <RelationFields f={rel} idPrefix="file" />

      <p className="text-xs text-muted-foreground">{describeTarget(target)}{isBackend ? '. Existing files are never overwritten.' : ''}</p>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeAdd}>Cancel</Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>Add files</Button>
      </div>
    </div>
  )
}
