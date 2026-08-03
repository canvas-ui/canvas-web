import { MapPin, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Geotag } from '@/hooks/useGeotag'

// Shown under the switch so the user knows what will be recorded (and why it's
// off) before saving — the accuracy readout is what makes a bad fix legible
// instead of a mystery pin somewhere down the street.
function hint(g: Geotag): string {
  if (!g.supported) return 'Needs a secure (https) connection'
  if (g.permission === 'denied') return 'Blocked — allow location for this site in your browser settings'
  if (g.error) return g.error
  if (g.busy) return 'Getting your location…'
  if (g.enabled && g.fix) {
    const { lat, lon, accuracy } = g.fix
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}${accuracy != null ? ` · ±${accuracy} m` : ''}`
  }
  if (g.enabled) return 'Location will be attached when you save'
  return 'Attach where you are to this document'
}

export function GeotagToggle({ geotag: g, idPrefix = 'geotag' }: { geotag: Geotag; idPrefix?: string }) {
  const disabled = !g.supported || g.permission === 'denied'
  const problem = !g.supported || g.permission === 'denied' || !!g.error

  return (
    <div className="space-y-1.5">
      <div
        role="switch"
        aria-checked={g.enabled}
        aria-disabled={disabled}
        aria-label="Geotag this document"
        aria-describedby={`${idPrefix}-hint`}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && g.setEnabled(!g.enabled)}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            g.setEnabled(!g.enabled)
          }
        }}
        className={cn(
          'flex items-center justify-between gap-3 select-none outline-none rounded focus-visible:ring-2 focus-visible:ring-ring',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        )}
      >
        <span className="flex items-center gap-2 text-sm text-foreground">
          {g.busy
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            : <MapPin className={cn('h-4 w-4 shrink-0', g.enabled ? 'text-info' : 'text-muted-foreground')} />}
          Geotag
        </span>
        <div className={cn('relative h-5 w-10 shrink-0 rounded-full transition-colors', g.enabled ? 'bg-info' : 'bg-muted-foreground/30')}>
          <div
            className={cn(
              'absolute top-[2px] h-4 w-4 rounded-full bg-background shadow-elevation-1 transition-transform',
              g.enabled ? 'translate-x-[22px]' : 'translate-x-[2px]',
            )}
          />
        </div>
      </div>
      <p id={`${idPrefix}-hint`} className={cn('text-xs', problem ? 'text-warning' : 'text-muted-foreground')}>
        {hint(g)}
      </p>
    </div>
  )
}
