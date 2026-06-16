import { lazy, Suspense } from 'react'

// Lazy boundaries for the tiptap / ProseMirror editor stack (~hundreds of kB).
// Keeping every consumer dynamic means the editor ships as its own async chunk
// instead of bloating the main bundle.

const MarkdownEditorImpl = lazy(() =>
  import('@/components/toolbox/add/MarkdownEditor').then((m) => ({ default: m.MarkdownEditor }))
)
const NoteViewerImpl = lazy(() => import('@/components/common/NoteViewer'))

const editorFallback = (
  <div className="rounded-md border border-input p-3 text-sm text-muted-foreground">Loading editor…</div>
)

export function LazyMarkdownEditor(props: { value: string; onChange: (markdown: string) => void; placeholder?: string }) {
  return (
    <Suspense fallback={editorFallback}>
      <MarkdownEditorImpl {...props} />
    </Suspense>
  )
}

export function LazyNoteViewer({ content }: { content: string }) {
  return (
    <Suspense fallback={editorFallback}>
      <NoteViewerImpl content={content} />
    </Suspense>
  )
}
