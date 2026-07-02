import { useEffect, useRef, useState } from 'react'
import { Camera, File as FileIcon, X } from 'lucide-react'
import { uploadWorkspaceBlob } from '@/services/blobs'
import { submitDocuments, type AddTarget } from '@/components/toolbox/add/useAddTarget'
import { B5Card, type B5SaveTarget } from '../B5Card'

// Capture-to-file only: the OS camera UI *is* the capture flow (no in-app
// preview/record). Explicitly not the deferred live record-to-agent feature.
export function PhotoCardBody({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const save = async (target: B5SaveTarget) => {
    if (!file) return []
    setSaving(true)
    try {
      const blob = await uploadWorkspaceBlob(target.workspaceName, file)
      const doc = {
        schema: 'data/abstraction/file',
        schemaVersion: '3.0',
        data: {},
        checksumArray: [`sha256/${blob.checksum}`],
        locations: [{ url: blob.url, metadata: { filename: file.name } }],
        metadata: { contentType: file.type, size: blob.size },
      }
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
      <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
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
          <div className="flex w-full flex-1 flex-col gap-3 overflow-hidden">
            <div className="flex flex-1 items-center justify-center overflow-hidden rounded-md border border-input bg-muted/30">
              {previewUrl && file.type.startsWith('video/') ? (
                <video src={previewUrl} controls className="max-h-full max-w-full" />
              ) : previewUrl ? (
                <img src={previewUrl} alt={file.name} className="max-h-full max-w-full object-contain" />
              ) : null}
            </div>
            <div className="flex w-full shrink-0 items-center gap-2 rounded border border-input px-3 py-2 text-sm">
              <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} aria-label="Remove" className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
    </B5Card>
  )
}
