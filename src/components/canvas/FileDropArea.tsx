import { DocumentActionDialog } from '@/components/common/document-action-dialog'
import { useRef, useState, type ReactNode } from 'react'
import { useUploadQueue } from '@/components/toolbox/add/useUploadQueue'
import { buildFileDocument } from '@/components/toolbox/add/useFileFields'
import { UploadProgressList } from '@/components/toolbox/add/UploadProgressList'
import type { AddTarget } from '@/components/toolbox/add/useAddTarget'
import { useToastHelpers } from '@/hooks/useToastHelpers'

/** OS file drops belong to this canvas, independently of toolbox focus. */
export function FileDropArea({ target, children }: { target: AddTarget; children: ReactNode }) {
  const queue = useUploadQueue()
  const busy = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [over, setOver] = useState(false)
  const [open, setOpen] = useState(false)
  const [destination, setDestination] = useState<AddTarget>(null)
  const { showErrorToast, showSuccessToast } = useToastHelpers()
  const upload = async (to: AddTarget) => {
    if (busy.current) return
    busy.current = true
    setUploading(true)
    try {
      const summary = await queue.start(to, buildFileDocument)
      if (summary.failed) showErrorToast(`${summary.failed} of ${summary.total} files failed to upload`)
      else showSuccessToast(`${summary.done} file(s) uploaded`)
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Upload failed')
    } finally { busy.current = false; setUploading(false) }
  }
  return <div className={`relative flex flex-col h-full min-h-0 bg-background ${over ? 'ring-2 ring-inset ring-primary' : ''}`}
    onDragOverCapture={event => {
      if (!target || !Array.from(event.dataTransfer.types).includes('Files')) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = busy.current ? 'none' : 'copy'
      setOver(!busy.current)
    }}
    onDragLeaveCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false)
    }}
    onDropCapture={event => {
      if (!target || !Array.from(event.dataTransfer.types).includes('Files')) return
      event.preventDefault()
      event.stopPropagation()
      setOver(false)
      if (busy.current) { showErrorToast('Wait for the current upload to finish'); return }
      const files = Array.from(event.dataTransfer.files)
      if (!files.length) { showErrorToast('Drop files rather than folders'); return }
      queue.reset()
      queue.addFiles(files)
      setDestination(target)
      setOpen(true)
    }}>
    {children}
    {over && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/80 text-sm font-medium">Drop files to upload to {target?.mode === 'workspace' ? target.path : 'this context'}</div>}
    {open && <DocumentActionDialog label="Import files" onClose={() => { if (!busy.current) setOpen(false) }}>
      <div className="space-y-4 p-4" aria-live="polite">
      <h2 className="text-sm font-medium">Import files</h2>
      <p className="text-xs text-muted-foreground">Storage: workspace:data (default)</p>
      <p className="mb-2 text-xs text-muted-foreground">Uploads to {destination?.mode === 'workspace' ? destination.path : 'this context'}</p>
      <UploadProgressList items={queue.items} running={uploading} onRemove={queue.removeItem} />
      <div className="mt-2 flex gap-3 text-xs">
        {uploading ? <button disabled={!queue.running} onClick={queue.cancel}>Cancel upload</button> : <>
          {queue.items.some(item => item.status !== 'done') && <button onClick={() => void upload(destination)}>{queue.items.some(item => item.status === 'error') ? 'Retry unfinished' : 'Import files'}</button>}
          <button onClick={() => { queue.reset(); setOpen(false) }}>Close</button>
        </>}
      </div>
    </div></DocumentActionDialog>}
  </div>
}
