import type { Editor } from '@tiptap/react'
import type { MarkdownStorage } from 'tiptap-markdown'

// tiptap-markdown registers its storage under `markdown` but ships no module
// augmentation for tiptap's Storage type — narrow it here in one place.
export function getMarkdown(editor: Editor): string {
  const storage = (editor.storage as { markdown?: MarkdownStorage }).markdown
  return storage?.getMarkdown() ?? ''
}
