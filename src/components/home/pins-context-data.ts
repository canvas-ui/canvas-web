import { createContext, useContext } from 'react'
import type { PinnedCanvas } from '@/services/user-config'

export interface CanvasAddress {
  workspaceName: string
  treeName: string
  path: string
  layerId?: string
  label?: string
}

export interface PinsValue {
  pins: PinnedCanvas[]
  isLoading: boolean
  isPinned: (address: CanvasAddress) => boolean
  pin: (address: CanvasAddress) => Promise<void>
  unpin: (id: string) => Promise<void>
  movePin: (id: string, beforeId: string | null) => Promise<void>
}

export const PinsContext = createContext<PinsValue | null>(null)
export const addressKey = (address: CanvasAddress | PinnedCanvas) => `${address.workspaceName}\0${address.treeName}\0${address.path}`

export function useCanvasPins(): PinsValue {
  const context = useContext(PinsContext)
  if (!context) throw new Error('useCanvasPins must be used within a CanvasPinsProvider')
  return context
}
