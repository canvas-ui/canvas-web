import { useState, type DragEvent, type ReactNode } from 'react'
import { uploadDroppedFiles, type WorkspaceUploadTarget } from '@/components/toolbox/add/upload-manager'
import { isFileDrag } from '@/components/toolbox/add/dropped-files'
import { useToastHelpers } from '@/hooks/useToastHelpers'

/**
 * OS file drops belong to this canvas, independently of toolbox focus. Files
 * dropped on a folder entry (`data-drop-folder`) go into that folder, anything
 * else into the folder in view. Uploads start at once and run in the
 * background (upload tray).
 */
export function FileDropArea({ target, children }: { target: WorkspaceUploadTarget | null; children: ReactNode }) {
  const [over, setOver] = useState<string | null>(null)
  const { showErrorToast } = useToastHelpers()
  const folderAt = (event: DragEvent): string | null =>
    (event.target as HTMLElement).closest?.<HTMLElement>('[data-drop-folder]')?.dataset.dropFolder || null
  return <div className={`relative flex flex-col h-full min-h-0 bg-background ${over ? 'ring-2 ring-inset ring-primary' : ''}`}
    onDragOverCapture={event => {
      if (!target || !isFileDrag(event.dataTransfer)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'copy'
      setOver(folderAt(event) ?? target.path)
    }}
    onDragLeaveCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(null)
    }}
    onDropCapture={event => {
      if (!target || !isFileDrag(event.dataTransfer)) return
      event.preventDefault()
      event.stopPropagation()
      setOver(null)
      const folder = folderAt(event)
      void uploadDroppedFiles(event.dataTransfer, folder ? { ...target, path: folder } : target)
        .then(count => { if (!count) showErrorToast('Nothing to upload in this drop') })
        .catch(error => showErrorToast(error instanceof Error ? error.message : 'Could not read the dropped files'))
    }}>
    {children}
    {over && <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
      <span className="rounded-md border bg-popover px-3 py-1.5 text-sm font-medium shadow-elevation-3">Drop to upload to {over}</span>
    </div>}
  </div>
}
