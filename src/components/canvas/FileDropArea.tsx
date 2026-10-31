import { DocumentActionDialog } from '@/components/common/document-action-dialog'
import { useRef, useState, type ReactNode } from 'react'
import { FileForm } from '@/components/toolbox/add/FileForm'
import type { AddTarget } from '@/components/toolbox/add/useAddTarget'
import { useToastHelpers } from '@/hooks/useToastHelpers'

/** OS file drops belong to this canvas, independently of toolbox focus. */
export function FileDropArea({ target, children }: { target: AddTarget; children: ReactNode }) {
  const [files, setFiles] = useState<File[]>([])
  const busy = useRef(false)
  const [over, setOver] = useState(false)
  const [open, setOpen] = useState(false)
  const [destination, setDestination] = useState<AddTarget>(null)
  const { showErrorToast } = useToastHelpers()
  return <div className={`relative flex flex-col h-full min-h-0 bg-background ${over ? 'ring-2 ring-inset ring-primary' : ''}`}
    onDragOverCapture={event => {
      if (open || !target || !Array.from(event.dataTransfer.types).includes('Files')) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = busy.current ? 'none' : 'copy'
      setOver(!busy.current)
    }}
    onDragLeaveCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false)
    }}
    onDropCapture={event => {
      if (open || !target || !Array.from(event.dataTransfer.types).includes('Files')) return
      event.preventDefault()
      event.stopPropagation()
      setOver(false)
      if (busy.current) { showErrorToast('Wait for the current upload to finish'); return }
      const files = Array.from(event.dataTransfer.files)
      if (!files.length) { showErrorToast('Drop files rather than folders'); return }
      setFiles(files)
      setDestination(target)
      setOpen(true)
    }}>
    {children}
    {over && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/80 text-sm font-medium">Drop files to upload to {target?.mode === 'workspace' ? target.path : 'this context'}</div>}
    {open && <DocumentActionDialog label="Import files" onClose={() => { if (!busy.current) setOpen(false) }}>
      <h2 className="border-b px-4 py-3 text-sm font-medium">Import files</h2>
      <FileForm target={destination} initialFiles={files} onClose={() => setOpen(false)} onBusyChange={value => { busy.current = value }} />
    </DocumentActionDialog>}
  </div>
}
