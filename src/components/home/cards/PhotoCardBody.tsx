import { useEffect, useRef, useState } from 'react'
import { Camera, File as FileIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadWorkspaceBlob } from '@/services/blobs'
import { submitDocuments, type AddTarget } from '@/components/toolbox/add/useAddTarget'
import { useFileFields, buildFileDocument } from '@/components/toolbox/add/useFileFields'
import { FileMetaFields } from '@/components/toolbox/add/FileMetaFields'
import { useToolbox } from '@/components/toolbox/use-toolbox'
import { B5Card, type B5SaveTarget } from '../B5Card'

// Capture-to-file only: the OS camera UI *is* the capture flow (no in-app
// preview/record). Explicitly not the deferred live record-to-agent feature.
export function PhotoCardBody({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  // File + its object URL live together: the URL is created in the pick
  // handler (event, not effect) and revoked by the effect cleanup below.
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null)
  const file = shot?.file ?? null
  const previewUrl = shot?.url ?? null
  const [saving, setSaving] = useState(false)
  // Target workspace comes from the Save/Link-to picker, so suggestions fall
  // back to the toolbox's active workspace (null on home → freeform).
  const { state } = useToolbox()
  const meta = useFileFields(state.activeWorkspaceName)

  const pickFile = (f: File | null) =>
    setShot(f ? { file: f, url: URL.createObjectURL(f) } : null)

  // Revoke the object URL when the shot changes or the card unmounts.
  useEffect(() => {
    if (!shot) return
    const url = shot.url
    return () => URL.revokeObjectURL(url)
  }, [shot])

  const save = async (target: B5SaveTarget) => {
    if (!file) return []
    setSaving(true)
    try {
      const geo = await meta.geotag.capture()
      const blob = await uploadWorkspaceBlob(target.workspaceName, file)
      const doc = buildFileDocument(blob, file, { tags: meta.tags, comment: meta.comment, geo })
      const addTarget: AddTarget = { mode: 'workspace', ...target }
      return await submitDocuments(addTarget, [doc])
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
      canSave={!!file}
      saving={saving}
      successMessage="Upload saved"
    >
      {/* Centre the empty state; once a shot exists the preview shares the card
          with the tag/comment fields and must be free to shrink. */}
      <div className={cn('flex h-full flex-col gap-4 p-4', !file && 'items-center justify-center')}>
        {!file ? (
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
            <div className="flex min-h-0 w-full flex-1 flex-col gap-3">
              <div className="flex min-h-[6rem] flex-1 items-center justify-center overflow-hidden rounded-md border border-input bg-muted/30">
                {previewUrl && file.type.startsWith('video/') ? (
                  <video src={previewUrl} controls className="max-h-full max-w-full" />
                ) : previewUrl ? (
                  <img src={previewUrl} alt={file.name} className="max-h-full max-w-full object-contain" />
                ) : null}
              </div>
              <div className="flex w-full shrink-0 items-center gap-2 rounded border border-input px-3 py-2 text-sm">
                <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{file.name}</span>
                <button type="button" onClick={() => pickFile(null)} aria-label="Remove" className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="w-full shrink-0 space-y-4">
              <FileMetaFields fields={meta} idPrefix="qa-photo" />
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </div>
    </B5Card>
  )
}
