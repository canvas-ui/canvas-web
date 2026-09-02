import { LazyMarkdownEditor } from '@/components/common/lazy-editor'
import type { BodyKind } from '@/lib/text-document'

/**
 * THE body editor. A note, a markdown file and a plain text file all edit
 * through this one wrapper and save through one path — the only difference is
 * what sits inside it: the tiptap markdown editor for markdown, a monospace
 * pane for text whose characters must survive verbatim.
 */
export function DocumentBodyEditor({
  kind, value, onChange, placeholder, rows = 16,
}: {
  kind: BodyKind
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  if (kind === 'markdown') {
    return <LazyMarkdownEditor value={value} onChange={onChange} placeholder={placeholder} />
  }
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      spellCheck={false}
      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs leading-relaxed shadow-elevation-1 transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  )
}

export default DocumentBodyEditor
