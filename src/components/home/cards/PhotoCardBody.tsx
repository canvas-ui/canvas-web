import { useRef, useState } from 'react'
import { Camera, File as FileIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUploadQueue } from '@/components/toolbox/add/useUploadQueue'
import { UploadProgressPanel } from '@/components/toolbox/add/UploadProgressList'
import { type AddTarget } from '@/components/toolbox/add/useAddTarget'
import { useFileFields, buildFileDocument } from '@/components/toolbox/add/useFileFields'
import { FileMetaFields } from '@/components/toolbox/add/FileMetaFields'
import { useToolbox } from '@/components/toolbox/use-toolbox'
import { B5Card, type B5SaveTarget } from '../B5Card'
import type { QuickAddInitialData } from '../quick-add-types'
import { MediaPreview } from './MediaPreview'

// Shared media and camera captures use the same preview and save form.
export function PhotoCardBody({ onClose, initialData }: { onClose: () => void; initialData?: QuickAddInitialData }) {
  const queue = useUploadQueue(initialData?.files)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasFiles = queue.items.length > 0
  const [saving, setSaving] = useState(false)
  // Target workspace comes from the Save/Link-to picker, so suggestions fall
  // back to the toolbox's active workspace (null on home → freeform).
  const { state } = useToolbox()
  const meta = useFileFields(state.activeWorkspaceName)

  const pickFile = (file: File | null) => {
    if (!saving && file) queue.addFiles([file])
  }

  const save = async (target: B5SaveTarget) => {
    if (!hasFiles) return []
    setSaving(true)
    try {
      const geo = await meta.geotag.capture()
      const addTarget: AddTarget = { mode: 'workspace', ...target }
      const summary = await queue.start(addTarget, (blob, file) =>
        buildFileDocument(blob, file, { tags: meta.tags, comment: meta.comment, geo }))
      if (summary.failed) throw new Error('Upload failed or cancelled. You can retry.')
      return summary.docIds
    } finally {
      setSaving(false)
    }
  }

  return (
    <B5Card
      title="Photo/Video"
      icon={Camera}
      onClose={onClose}
      onSave={save}
      navigateAfterSave
      canSave={hasFiles}
      saving={saving}
      saveProgress={<UploadProgressPanel items={queue.items} running={queue.running} onCancel={queue.cancel} />}
      successMessage="Upload saved"
    >
      {/* Centre the empty state; once a shot exists the preview shares the card
          with the tag/comment fields and must be free to shrink. */}
      <div className={cn('flex h-full flex-col gap-4 p-4', !hasFiles && 'items-center justify-center')}>
        {!hasFiles ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-md border border-dashed border-input px-6 py-10 text-center transition-colors hover:bg-muted/40"
          >
            <Camera className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm">Open camera</span>
          </button>
        ) : (
          <>
            <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto">
              {queue.items.map(({ id, file, status }) => (
                <div key={id} className="space-y-2">
                  <MediaPreview file={file} />
                  <div className="flex w-full items-center gap-2 rounded border border-input px-3 py-2 text-sm">
                    <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button type="button" disabled={saving || status === 'done'} onClick={() => queue.removeItem(id)} aria-label={`Remove ${file.name}`} className="text-muted-foreground hover:text-foreground disabled:opacity-40">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="w-full shrink-0 space-y-4">
              <FileMetaFields fields={meta} idPrefix="qa-photo" multiple={queue.items.length > 1} />
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          className="hidden"
          disabled={saving}
          onChange={(e) => { pickFile(e.target.files?.[0] ?? null); e.target.value = '' }}
        />
      </div>
    </B5Card>
  )
}
