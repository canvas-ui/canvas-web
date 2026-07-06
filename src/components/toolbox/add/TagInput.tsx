import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  // Existing tag values (e.g. from tag/* bitmaps) offered while typing.
  suggestions?: string[]
}

// Chip-style tag entry. Emits clean (trimmed, deduped) tag strings; the caller maps
// them to `tag/*` features via tagsToFeatures().
export function TagInput({ tags, onChange, placeholder = 'Add tag, press Enter', suggestions = [] }: TagInputProps) {
  const [draft, setDraft] = useState('')
  const matches = draft.trim()
    ? suggestions.filter(s => s.toLowerCase().includes(draft.trim().toLowerCase()) && !tags.includes(s)).slice(0, 8)
    : []

  const commit = () => {
    const t = draft.trim()
    if (t && !tags.includes(t)) onChange([...tags, t])
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Remove ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <div className="relative flex-1 min-w-[8ch]">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(commit, 150)}
          placeholder={tags.length ? '' : placeholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {matches.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-56 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
            {matches.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!tags.includes(s)) onChange([...tags, s])
                  setDraft('')
                }}
                className="block w-full rounded px-2 py-1 text-left hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
