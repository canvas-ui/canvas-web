import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { onUpdateReady, applyUpdate } from '@/lib/sw-update'

// "A new version is ready" pill — shown when the service worker has a waiting
// update (see lib/sw-update). Reloading is always the USER's click, never a
// surprise mid-work; dismissing keeps the current version for this session.
export function UpdateBanner() {
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => onUpdateReady(() => setReady(true)), [])

  if (!ready || dismissed) return null
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-elevation-2">
        <span className="text-sm">A new version of Canvas is ready</span>
        <button
          type="button"
          onClick={() => applyUpdate()}
          className="flex items-center gap-1 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background hover:bg-foreground/90"
        >
          <RefreshCw className="h-3 w-3" /> Reload
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Not now"
          className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
