import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getWebuiConfig, putWebuiConfig, type PinnedCanvas, type WebuiConfig } from '@/services/user-config'
import { createHomePinsWriter } from '@/lib/home-pins'
import { PinsContext, type CanvasAddress } from './use-canvas-pins'

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
      // shows an empty home; mutations re-read successfully before writing.
      .catch(() => { if (!cancelled) setConfig({}) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [])

  const pins = useMemo(() => config?.home?.pinnedCanvases ?? [], [config])

  const [persist] = useState(() => createHomePinsWriter(getWebuiConfig, putWebuiConfig, setConfig))

  const isPinned = useCallback(
    (address: CanvasAddress) => pins.some((p) => addressKey(p) === addressKey(address)),
    [pins],
  )

  const pin = useCallback(async (address: CanvasAddress) => {
    const id = crypto.randomUUID()
    await persist(current => current.some(p => addressKey(p) === addressKey(address)) ? current : [...current, { id, ...address }])
  }, [persist])

  const unpin = useCallback(async (id: string) => {
    await persist(current => current.filter(p => p.id !== id))
  }, [persist])

  const setMinimized = useCallback(async (id: string, minimized: boolean) => {
    await persist(current => current.map(p => p.id === id ? { ...p, minimized } : p))
  }, [persist])

  const movePin = useCallback(async (id: string, beforeId: string | null) => {
    await persist(current => {
      const moved = current.find(p => p.id === id)
      if (!moved || id === beforeId) return current
      const without = current.filter(p => p.id !== id)
      const at = beforeId === null ? without.length : without.findIndex(p => p.id === beforeId)
      if (at === -1) return current
      return [...without.slice(0, at), moved, ...without.slice(at)]
    })
  }, [persist])

  const value = useMemo(
    () => ({ pins, isLoading, isPinned, pin, unpin, movePin, setMinimized }),
    [pins, isLoading, isPinned, pin, unpin, movePin, setMinimized],
  )

  return <PinsContext.Provider value={value}>{children}</PinsContext.Provider>
}
