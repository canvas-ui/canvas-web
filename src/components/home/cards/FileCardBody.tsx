import { useRef, useState, type DragEvent } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUploadQueue } from '@/components/toolbox/add/useUploadQueue'
import { UploadProgressList, UploadProgressPanel } from '@/components/toolbox/add/UploadProgressList'
import { type AddTarget } from '@/components/toolbox/add/useAddTarget'
import { useFileFields, buildFileDocument } from '@/components/toolbox/add/useFileFields'
import { FileMetaFields } from '@/components/toolbox/add/FileMetaFields'
import { useToolbox } from '@/components/toolbox/use-toolbox'
import { B5Card, type B5SaveTarget } from '../B5Card'
import type { QuickAddInitialData } from '../quick-add-types'

export function FileCardBody({ onClose, initialData }: { onClose: () => void; initialData?: QuickAddInitialData }) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Prefill once on open only (lazy initializer, not an effect).
  const queue = useUploadQueue(initialData?.files)
  const files = queue.items.map((item) => item.file)
  const [dragOver, setDragOver] = useState(false)
  const [saving, setSaving] = useState(false)
  // The real target is only known once the Save/Link-to picker runs, so tag
  // suggestions fall back to the toolbox's active workspace — null on the home
  // screen, where TagInput just goes freeform.
  const { state } = useToolbox()
  const meta = useFileFields(state.activeWorkspaceName)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    if (!saving) queue.addFiles(Array.from(list))
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const canSave = files.length > 0

  const save = async (target: B5SaveTarget) => {
    setSaving(true)
    try {
      const addTarget: AddTarget = { mode: 'workspace', ...target }
      // One fix for the whole batch, taken before the uploads start.
      const geo = await meta.geotag.capture()
      const summary = await queue.start(addTarget, (blob, file) =>
        buildFileDocument(blob, file, { tags: meta.tags, comment: meta.comment, geo }))
      if (summary.failed) throw new Error(`${summary.failed} file(s) failed or cancelled. Retry keeps completed uploads.`)
      return summary.docIds
    } finally {
      setSaving(false)
    }
  }

  return (
    <B5Card
      title="Upload File"
      icon={Upload}
      onClose={onClose}
      onSave={save}
      canSave={canSave}
      saving={saving}
      saveProgress={<UploadProgressPanel items={queue.items} running={queue.running} onCancel={queue.cancel} />}
      successMessage="File(s) uploaded"
    >
      <div className="flex flex-col gap-4 p-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/40',
          )}
        >
          <Upload className="h-6 w-6 text-muted-foreground touch-target" />
          <p className="text-sm">Drag &amp; drop files here</p>
          <p className="text-xs text-muted-foreground">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            disabled={saving}
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
          />
        </div>

        <UploadProgressList items={queue.items} running={saving} onRemove={queue.removeItem} />

        <FileMetaFields fields={meta} idPrefix="qa-file" multiple={files.length > 1} />
      </div>
    </B5Card>
  )
}
