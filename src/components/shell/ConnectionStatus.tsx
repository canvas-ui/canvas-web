import { useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useOfflineStatus } from '@/hooks/useOfflineStatus'
import { retryServerConnection } from '@/lib/server-connection'

export function ConnectionStatus() {
  const offline = useOfflineStatus()
  const [checking, setChecking] = useState(false)
  if (!offline) return null

  return (
    <details className="relative">
      <summary aria-label="Offline — connection options" title="Offline — cached content available" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg text-amber-600 hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
        <WifiOff className="h-5 w-5" />
      </summary>
      <div className="absolute bottom-0 left-full z-50 ml-2 w-60 max-w-[calc(100vw-5rem)] rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
        <p className="text-sm font-medium" role="status">Offline</p>
        <p className="mt-1 text-xs text-muted-foreground">You can browse cached documents. We’ll reconnect automatically when the server is available.</p>
        <button type="button" disabled={checking} onClick={async () => {
          setChecking(true)
          try { await retryServerConnection() } finally { setChecking(false) }
        }} className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50">
          {checking ? 'Checking…' : 'Retry now'}
        </button>
      </div>
    </details>
  )
}
