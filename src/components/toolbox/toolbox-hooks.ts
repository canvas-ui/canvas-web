import { useContext } from 'react'
import { ToolboxCtx, type ToolboxContextValue } from './toolbox-context'

export function useToolbox(): ToolboxContextValue {
  const ctx = useContext(ToolboxCtx)
  if (!ctx) throw new Error('useToolbox must be used within a ToolboxProvider')
  return ctx
}

export function useToolboxOptional(): ToolboxContextValue | null {
  return useContext(ToolboxCtx)
}
