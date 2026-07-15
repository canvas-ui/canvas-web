import { useEffect } from 'react'
import { StickyNote } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LazyMarkdownEditor as MarkdownEditor } from '@/components/common/lazy-editor'
import { TagInput } from '@/components/toolbox/add/TagInput'
import { useNoteFields } from '@/components/toolbox/add/useNoteFields'
import { GeotagToggle } from '@/components/toolbox/add/GeotagToggle'
import { B5Card, type B5SaveTarget } from '../B5Card'
import type { QuickAddInitialData } from '../quick-add-types'

export function NoteCardBody({ onClose, initialData }: { onClose: () => void; initialData?: QuickAddInitialData }) {
  const f = useNoteFields()

  useEffect(() => {
    if (initialData?.title) f.setTitle(initialData.title)
    if (initialData?.content) f.setContent(initialData.content)
    // Prefill once on open only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <B5Card
      title="New Note"
      icon={StickyNote}
      onClose={onClose}
      onSave={(target: B5SaveTarget) => f.save({ mode: 'workspace', ...target })}
      canSave={f.canSave}
      saving={f.saving}
      successMessage="Note created"
    >
      <div className="flex h-full flex-col gap-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="qa-note-title">Title</Label>
          <Input
            id="qa-note-title"
            value={f.title}
            onChange={(e) => f.setTitle(e.target.value)}
            placeholder="Optional — defaults to today's date"
          />
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <Label>Body</Label>
          <div className="flex-1">
            <MarkdownEditor value={f.content} onChange={f.setContent} placeholder="Write your note…" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Tags</Label>
          <TagInput tags={f.tags} onChange={f.setTags} />
        </div>

        <GeotagToggle geotag={f.geotag} idPrefix="qa-note-geotag" />
      </div>
    </B5Card>
  )
}
