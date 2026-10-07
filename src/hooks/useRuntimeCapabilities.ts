import { useEffect, useState } from 'react'
import { API_URL } from '@/config/api'
export interface RuntimeCapabilities { local: boolean; agent?: boolean }
let pending: Promise<RuntimeCapabilities> | undefined
export function useRuntimeCapabilities() {
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities>({ local: false })
  useEffect(() => {
    pending ??= fetch(`${API_URL}/runtime/capabilities`).then(async response => response.ok ? (await response.json()).payload : { local: false }).catch(() => ({ local: false }))
    let active = true
    void pending.then(result => { if (active) setCapabilities(result) })
    return () => { active = false }
  }, [])
  return capabilities
}
