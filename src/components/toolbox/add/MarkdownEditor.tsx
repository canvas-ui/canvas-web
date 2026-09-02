import { useEffect } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { TableKit } from '@tiptap/extension-table'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { getMarkdown } from '@/lib/tiptap-markdown'
import './md-editor.css'
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Link as LinkIcon,
  Code,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MarkdownEditorProps {
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground',
        active && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-input px-1 py-1">
      <ToolbarButton title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code className="h-3.5 w-3.5" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-input" />
      <ToolbarButton title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-input" />
      <ToolbarButton title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-input" />
      <ToolbarButton title="Link" active={editor.isActive('link')} onClick={setLink}>
        <LinkIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  )
}

// TipTap WYSIWYG editor that reads/writes markdown via the tiptap-markdown extension.
// `onChange` always receives a markdown string (stored in note.data.content).
export function MarkdownEditor({ value, onChange, placeholder }: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      // StarterKit bundles the Link extension since tiptap v3 — configure it
      // here instead of registering @tiptap/extension-link a second time.
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      // Nodes the markdown a user opens can contain. ProseMirror DROPS what its
      // schema has no node for, so without these a GFM table opened here came
      // back as one run-on paragraph and `- [ ]` came back escaped — losing the
      // content on save. tiptap-markdown already ships the matching markdown
      // serializers; they only activate once the nodes exist.
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({ html: false, transformPastedText: true }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'canvas-no-drag markdown-body md-editor-content min-h-[8rem] px-3 py-2 text-sm outline-none',
        'data-placeholder': placeholder ?? '',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(getMarkdown(editor))
    },
  })

  // Keep editor in sync if the value is reset externally (e.g. after submit).
  useEffect(() => {
    // isDestroyed guard: a destroyed editor is truthy but its commandManager
    // is nulled — editor.commands then throws (StrictMode remount race).
    if (!editor || editor.isDestroyed) return
    const current = getMarkdown(editor)
    if (value !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [value, editor])

  if (!editor) return null

  return (
    <div className="rounded-md border border-input bg-transparent focus-within:ring-1 focus-within:ring-ring">
      <Toolbar editor={editor} />
      {/* resize-y needs a scroll container; the ProseMirror div stretches to
          fill it so clicks below short content still focus the editor. */}
      <div
        className="resize-y overflow-y-auto min-h-[8rem] max-h-[70vh] flex flex-col [&>div]:flex-1 [&_.ProseMirror]:h-full"
        onClick={() => editor.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
