import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UploadProgressList } from './UploadProgressList'
import { cancelUploadBatch, dismissUploadBatch, retryUploadBatch, useUploadBatches } from './upload-manager'
import { isFileDrag } from './dropped-files'

/**
 * App-level view of the background uploads: every batch with per-file
 * progress, cancel while it runs, retry/dismiss once it settled with failures.
 * Also owns two window guards: leaving the page mid-upload asks first, and a
 * file dropped outside any drop target is ignored instead of replacing the app
 * with that file.
 */
export function UploadTray() {
  const batches = useUploadBatches()
  const [collapsed, setCollapsed] = useState(false)
  const active = batches.some(batch => batch.state !== 'settled')

  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])

  useEffect(() => {
    const ignore = (event: DragEvent) => {
      if (event.defaultPrevented || !isFileDrag(event.dataTransfer)) return
      // Form inputs and editors keep the browser's own file-drop behaviour.
      if ((event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
    }
    window.addEventListener('dragover', ignore)
    window.addEventListener('drop', ignore)
    return () => { window.removeEventListener('dragover', ignore); window.removeEventListener('drop', ignore) }
  }, [])

  if (batches.length === 0) return null
  const files = batches.flatMap(batch => batch.items)
  const done = files.filter(item => item.status === 'done').length
  const failed = files.filter(item => item.status === 'error').length
  const title = active
    ? `Uploading ${done} / ${files.length}`
    : failed ? `${failed} of ${files.length} upload(s) failed` : `${done} file(s) uploaded`

  return <section aria-label="Uploads" className="fixed bottom-4 right-4 z-menu w-80 md:right-28 max-w-[calc(100vw-2rem)] rounded-md border bg-popover text-popover-foreground shadow-elevation-3 max-md:bottom-20">
    <header className="flex items-center gap-2 px-3 py-2">
      <span role="status" className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
      <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={collapsed ? 'Show uploads' : 'Hide uploads'} onClick={() => setCollapsed(value => !value)}>
        {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {!active && <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Dismiss uploads" onClick={() => batches.forEach(batch => dismissUploadBatch(batch.id))}>
        <X className="h-4 w-4" />
      </button>}
    </header>
    {!collapsed && <div className="max-h-[50vh] space-y-3 overflow-y-auto border-t p-3">
      {batches.map(batch => {
        const batchFailed = batch.items.filter(item => item.status === 'error').length
        return <div key={batch.id} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={batch.label}>{batch.label}</span>
            {batch.state !== 'settled' && <Button variant="outline" size="sm" onClick={() => cancelUploadBatch(batch.id)}>Cancel</Button>}
            {batch.state === 'settled' && batchFailed > 0 && <Button variant="outline" size="sm" onClick={() => retryUploadBatch(batch.id)}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />Retry ({batchFailed})
            </Button>}
          </div>
          <UploadProgressList items={batch.items} running onRemove={() => {}} />
        </div>
      })}
    </div>}
  </section>
}
