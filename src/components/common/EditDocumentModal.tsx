import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MarkdownEditor } from '@/components/toolbox/add/MarkdownEditor'
import { TagInput } from '@/components/toolbox/add/TagInput'
import { tagsToFeatures } from '@/components/toolbox/add/tags'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { updateWorkspaceDocument } from '@/services/workspace'
import type { Document } from '@/types/workspace'

const NOTE_SCHEMA = 'data/abstraction/note'
const LINK_SCHEMA = 'data/abstraction/link'

function featuresToTags(features: string[] | undefined): string[] {
  return (features || [])
    .filter((f) => f.startsWith('tag/'))
    .map((f) => f.slice(4))
}

interface EditDocumentModalProps {
  document: Document
  workspaceId: string
  onClose: () => void
  onSaved: () => void
}

export function EditDocumentModal({ document, workspaceId, onClose, onSaved }: EditDocumentModalProps) {
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const isNote = document.schema === NOTE_SCHEMA
  const isLink = document.schema === LINK_SCHEMA

  const initialTags = featuresToTags((document.metadata as any)?.features)

  const [title, setTitle] = useState<string>(document.data?.title ?? '')
  const [content, setContent] = useState<string>(document.data?.content ?? '')
  const [label, setLabel] = useState<string>(document.data?.label ?? '')
  const [tags, setTags] = useState<string[]>(initialTags)
  const [saving, setSaving] = useState(false)

  if (!isNote && !isLink) return null

  const canSave = !saving && (isNote ? content.trim().length > 0 : true)

  const handleSave = async () => {
    setSaving(true)
    try {
      let updatedData: Record<string, any>

      if (isNote) {
        updatedData = {
          ...(title.trim() ? { title: title.trim() } : {}),
          content,
        }
      } else {
        const cleanTags = tags.map((t) => t.trim()).filter(Boolean)
        updatedData = {
          ...document.data,
          ...(label.trim() ? { label: label.trim() } : { label: undefined }),
          ...(cleanTags.length ? { tags: cleanTags } : { tags: [] }),
        }
        if (!label.trim()) delete updatedData.label
      }

      await updateWorkspaceDocument(workspaceId, {
        id: document.id,
        schema: document.schema,
        schemaVersion: document.schemaVersion,
        data: updatedData,
        metadata: { features: tagsToFeatures(tags) },
      })

      showSuccessToast('Document updated')
      onSaved()
      onClose()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to update document')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Edit {isNote ? 'Note' : 'Link'}</h2>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-sm" title="Close">✕</button>
          </div>

          <div className="flex flex-col gap-4">
            {isLink && (
              <div className="space-y-1.5">
                <Label>URL <span className="text-xs text-muted-foreground">(frozen — checksum key)</span></Label>
                <Input value={document.data?.uri ?? ''} disabled className="font-mono text-xs" />
              </div>
            )}

            {isNote && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Optional — defaults to today's date"
                />
              </div>
            )}

            {isLink && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-label">Label</Label>
                <Input
                  id="edit-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Optional display name"
                />
              </div>
            )}

            {isNote && (
              <div className="space-y-1.5">
                <Label>Body</Label>
                <MarkdownEditor value={content} onChange={setContent} placeholder="Write your note…" />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Tags</Label>
              <TagInput tags={tags} onChange={setTags} />
            </div>
          </div>

          <div className="mt-6 pt-4 border-t flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!canSave}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
