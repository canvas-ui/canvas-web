import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown as TiptapMarkdown } from 'tiptap-markdown'
import { getMarkdown } from '@/lib/tiptap-markdown'

// Read-only markdown renderer (tiptap). Kept in its own module so the tiptap /
// ProseMirror stack lands in a lazy-loaded chunk, off the main bundle.
export function NoteViewer({ content }: { content: string }) {
  const editor = useEditor({
    extensions: [
      // StarterKit bundles the Link extension since tiptap v3 — configure it
      // here instead of registering @tiptap/extension-link a second time.
      StarterKit.configure({ link: { openOnClick: true, autolink: true } }),
      TiptapMarkdown.configure({ html: false, transformPastedText: true }),
    ],
    content,
    editable: false,
    editorProps: {
      attributes: { class: 'md-editor-content px-3 py-2 text-sm outline-none' },
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = getMarkdown(editor)
    if (content !== current) editor.commands.setContent(content || '', { emitUpdate: false })
  }, [content, editor])

  if (!editor) return null
  return <EditorContent editor={editor} />
}

export default NoteViewer
