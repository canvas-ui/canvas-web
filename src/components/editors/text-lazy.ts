import { lazy } from 'react'

// One shared lazy instance of the full-surface text/markdown editor: the
// document modal and the side card both mount it, and the tiptap chunk loads
// once (see components/common/lazy-editor.tsx for the inline editor).
export const LazyTextDocumentEditor = lazy(() => import('@/components/editors/TextDocumentEditor'))
