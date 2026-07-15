import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Upload, File as FileIcon, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { uploadWorkspaceBlob } from '@/services/blobs'
import { submitDocuments, type AddTarget } from '@/components/toolbox/add/useAddTarget'
import { useFileFields, buildFileDocument } from '@/components/toolbox/add/useFileFields'
import { FileMetaFields } from '@/components/toolbox/add/FileMetaFields'
import { useToolbox } from '@/components/toolbox/toolbox-context'
import { B5Card, type B5SaveTarget } from '../B5Card'
import type { QuickAddInitialData } from '../quick-add-types'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileCardBody({ onClose, initialData }: { onClose: () => void; initialData?: QuickAddInitialData }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [saving, setSaving] = useState(false)
  // The real target is only known once the Save/Link-to picker runs, so tag
  // suggestions fall back to the toolbox's active workspace — null on the home
  // screen, where TagInput just goes freeform.
  const { state } = useToolbox()
  const meta = useFileFields(state.activeWorkspaceName)

  useEffect(() => {
    if (initialData?.files?.length) setFiles(initialData.files)
    // Prefill once on open only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list)
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`))
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))]
    })
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
      const docs = []
      for (const file of files) {
        const blob = await uploadWorkspaceBlob(target.workspaceName, file)
        docs.push(buildFileDocument(blob, file, { tags: meta.tags, comment: meta.comment }))
      }
      return await submitDocuments(addTarget, docs)
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
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm">Drag &amp; drop files here</p>
          <p className="text-xs text-muted-foreground">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
          />
        </div>

        {files.length > 0 && (
          <div className="space-y-1.5">
            <Label>{files.length} file(s)</Label>
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {files.map((f, i) => (
                <li
                  key={`${f.name}:${f.size}:${i}`}
                  className="flex items-center gap-2 rounded border border-input px-2 py-1 text-sm"
                >
                  <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <FileMetaFields fields={meta} idPrefix="qa-file" multiple={files.length > 1} />
      </div>
    </B5Card>
  )
}
