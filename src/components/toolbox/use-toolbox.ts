import { createContext, useContext } from 'react'
import type { ToolboxContextValue } from './toolbox-context'

export const ToolboxCtx = createContext<ToolboxContextValue | null>(null)

export function useToolbox(): ToolboxContextValue {
  const ctx = useContext(ToolboxCtx)
  if (!ctx) throw new Error('useToolbox must be used within a ToolboxProvider')
  return ctx
}

// For components that also render outside the app shell (public shares):
// null instead of throwing when no provider is mounted.
export function useToolboxOptional(): ToolboxContextValue | null {
  return useContext(ToolboxCtx)
}
