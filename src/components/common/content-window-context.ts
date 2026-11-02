import { createContext, useContext } from 'react'
import type { ContentView } from './content-views'

/** A host window can keep its selected view while its data path changes. */
export const ContentWindowContext = createContext<{
  schema?: string
  compact?: boolean
  pinned: boolean
  view?: ContentView
  documentLayout?: 'card' | 'table' | 'tile'
  selectView: (view: ContentView) => void
  selectDocumentLayout: (layout: 'card' | 'table' | 'tile') => void
} | null>(null)
export const useContentWindow = () => useContext(ContentWindowContext)
