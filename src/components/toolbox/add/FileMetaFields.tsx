import { Label } from '@/components/ui/label'
import { TagInput } from './TagInput'
import { GeotagToggle } from './GeotagToggle'
import type { FileFields } from './useFileFields'

const textareaClass = 'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-elevation-1 transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/**
 * Tags + comment + geotag for an upload. Shared by the toolbox FileForm and the home
 * File/Photo cards. When several files are selected the values apply to all of
 * them — batch-tagging a set of photos is the common case, and per-file fields
 * would be unusable on a phone.
 */
export function FileMetaFields({ fields: f, idPrefix = 'file', multiple = false }: { fields: FileFields; idPrefix?: string; multiple?: boolean }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput tags={f.tags} onChange={f.setTags} suggestions={f.suggestions} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-comment`}>Comment</Label>
        <textarea
          id={`${idPrefix}-comment`}
          value={f.comment}
          onChange={(e) => f.setComment(e.target.value)}
          rows={3}
          placeholder="Optional — searchable, and the only text a photo has"
          className={textareaClass}
        />
        {multiple && f.tags.length + f.comment.trim().length > 0 && (
          <p className="text-xs text-muted-foreground">Applied to every file in this upload</p>
        )}
      </div>

      <GeotagToggle geotag={f.geotag} idPrefix={`${idPrefix}-geotag`} />
    </>
  )
}
