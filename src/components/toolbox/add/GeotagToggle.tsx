import { useState } from 'react'
import { MapPin, Loader2, Map, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Geotag } from '@/hooks/useGeotag'
import { LocationPickerSheet } from '@/components/common/LocationPickerSheet'

// Shown under the switch so the user knows what will be recorded (and why it's
// off) before saving — the accuracy readout is what makes a bad fix legible
// instead of a mystery pin somewhere down the street.
function hint(g: Geotag): string {
  // A hand-picked point is reported first: it overrides the device fix at
  // capture(), so describing anything else here would be a lie.
  if (g.manual) {
    const coords = `${g.manual.lat.toFixed(5)}, ${g.manual.lon.toFixed(5)}`
    return g.manualLabel ? `${g.manualLabel} · ${coords}` : `Custom pin · ${coords}`
  }
  if (!g.supported) return 'Needs a secure (https) connection — or pick a point on the map'
  if (g.permission === 'denied') return 'Blocked — allow location for this site, or pick a point on the map'
  if (g.error) return g.error
  if (g.busy) return 'Getting your location…'
  if (g.enabled && g.fix) {
    const { lat, lon, accuracy } = g.fix
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}${accuracy != null ? ` · ±${accuracy} m` : ''}`
  }
  if (g.enabled) return 'Location will be attached when you save'
  return 'Attach where you are — or pick any point on the map'
}

export function GeotagToggle({ geotag: g, idPrefix = 'geotag' }: { geotag: Geotag; idPrefix?: string }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  // The switch only drives DEVICE geolocation, so it greys out with the device
  // API. The map picker never does — that is the whole point of a custom
  // geotag on an insecure origin or with location permission denied.
  const disabled = !g.supported || g.permission === 'denied'
  const problem = !g.manual && (!g.supported || g.permission === 'denied' || !!g.error)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
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
            'flex flex-1 items-center justify-between gap-3 select-none outline-none rounded focus-visible:ring-2 focus-visible:ring-ring',
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

        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            title="Pick a point on the map"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Map className="h-3.5 w-3.5" />
            {g.manual ? 'Change pin' : 'Pick on map'}
          </button>
          {g.manual && (
            <button
              type="button"
              onClick={() => g.setManual(null)}
              aria-label="Remove custom pin"
              title="Remove custom pin"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>

      <p id={`${idPrefix}-hint`} className={cn('text-xs', problem ? 'text-warning' : 'text-muted-foreground')}>
        {hint(g)}
      </p>

      {pickerOpen && (
        <LocationPickerSheet
          initial={g.manual ?? g.fix ?? null}
          onPick={(p) => g.setManual(p)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
