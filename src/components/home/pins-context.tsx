import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getWebuiConfig, putWebuiConfig, type PinnedCanvas, type WebuiConfig } from '@/services/user-config'

// A canvas address, without the pin identity. What the caller knows.
export interface CanvasAddress {
  workspaceName: string
  treeName: string
  path: string
  layerId?: string
  label?: string
}

interface PinsValue {
  pins: PinnedCanvas[]
  isLoading: boolean
  isPinned: (address: CanvasAddress) => boolean
  pin: (address: CanvasAddress) => Promise<void>
  unpin: (id: string) => Promise<void>
  /** Reorder: move pin `id` before `beforeId` (null = to the end). */
  movePin: (id: string, beforeId: string | null) => Promise<void>
}

const PinsContext = createContext<PinsValue | null>(null)

// Canvases are addressed by workspace + tree + path; a pin is unique on those
// three. layerId is not the key: it is absent on older pins and the address is
// what the home page actually resolves against the live tree.
const addressKey = (a: CanvasAddress | PinnedCanvas) => `${a.workspaceName}\0${a.treeName}\0${a.path}`

export function CanvasPinsProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<WebuiConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getWebuiConfig()
      .then((loaded) => { if (!cancelled) setConfig(loaded) })
      // A config that will not load must not break the app shell; an empty one
      // just means "no pins yet" and the next write repairs it.
      .catch(() => { if (!cancelled) setConfig({}) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [])

  const pins = useMemo(() => config?.home?.pinnedCanvases ?? [], [config])

  // Whole-document read-modify-write: sibling keys in webui.json are preserved
  // because we merge into the config we loaded rather than sending only `home`.
  const persist = useCallback(async (nextPins: PinnedCanvas[]) => {
    const base = config ?? {}
    const next: WebuiConfig = { ...base, home: { ...(base.home ?? {}), pinnedCanvases: nextPins } }
    setConfig(next)
    try {
      await putWebuiConfig(next)
    } catch (error) {
      setConfig(base)
      throw error
    }
  }, [config])

  const isPinned = useCallback(
    (address: CanvasAddress) => pins.some((p) => addressKey(p) === addressKey(address)),
    [pins],
  )

  const pin = useCallback(async (address: CanvasAddress) => {
    if (pins.some((p) => addressKey(p) === addressKey(address))) return
    await persist([...pins, { id: crypto.randomUUID(), ...address }])
  }, [pins, persist])

  const unpin = useCallback(async (id: string) => {
    await persist(pins.filter((p) => p.id !== id))
  }, [pins, persist])

  // Home tiles render in array order, so reordering IS the arrangement.
  // persist() is optimistic with rollback, same as pin/unpin.
  const movePin = useCallback(async (id: string, beforeId: string | null) => {
    const moved = pins.find((p) => p.id === id)
    if (!moved || id === beforeId) return
    const without = pins.filter((p) => p.id !== id)
    const at = beforeId === null ? without.length : without.findIndex((p) => p.id === beforeId)
    if (at === -1) return
    const next = [...without.slice(0, at), moved, ...without.slice(at)]
    if (next.every((p, i) => p === pins[i])) return // no-op move — skip the write
    await persist(next)
  }, [pins, persist])

  const value = useMemo(
    () => ({ pins, isLoading, isPinned, pin, unpin, movePin }),
    [pins, isLoading, isPinned, pin, unpin, movePin],
  )

  return <PinsContext.Provider value={value}>{children}</PinsContext.Provider>
}

export function useCanvasPins(): PinsValue {
  const ctx = useContext(PinsContext)
  if (!ctx) throw new Error('useCanvasPins must be used within a CanvasPinsProvider')
  return ctx
}
