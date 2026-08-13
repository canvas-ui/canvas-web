import { createContext, useContext } from 'react'
import type { PinnedCanvas } from '@/services/user-config'

// A canvas address, without the pin identity. What the caller knows.
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
  /** Reorder: move pin `id` before `beforeId` (null = to the end). */
  movePin: (id: string, beforeId: string | null) => Promise<void>
}

export const PinsContext = createContext<PinsValue | null>(null)

export function useCanvasPins(): PinsValue {
  const ctx = useContext(PinsContext)
  if (!ctx) throw new Error('useCanvasPins must be used within a CanvasPinsProvider')
  return ctx
}
