import { createContext, useContext } from 'react'
import type { Document } from '@/types/workspace'

export interface SideViewEntry { document: Document; workspaceId: string }
export interface SideViewContextValue {
  entry: SideViewEntry | null
  open: (document: Document, workspaceId: string) => void
  close: () => void
}
export const SideViewContext = createContext<SideViewContextValue | null>(null)
const noop: SideViewContextValue = { entry: null, open: () => {}, close: () => {} }
export function useSideView(): SideViewContextValue {
  return useContext(SideViewContext) ?? noop
}
