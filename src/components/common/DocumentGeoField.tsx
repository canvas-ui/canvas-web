/**
 * DocumentGeoField — read/set/clear `metadata.geo` on an EXISTING document,
 * for the object-card edit form. Universal: any schema can carry a location, and
 * the common case is a photo that reached the workspace without one (a scan, a
 * screenshot, a camera with GPS off) or with a wrong one.
 *
 * Writes are stamped `source: 'manual'`, which outranks `exif` and `device` in
 * the server's pickGeo — so a hand-placed pin is not reverted the next time the
 * file's bytes are re-examined for EXIF.
 */
import { useState } from 'react'
import { MapPin, Map, Trash2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { LocationPickerSheet } from './LocationPickerSheet'
import type { DocumentGeo, GeoSource } from '@/types/workspace'

const SOURCE_LABEL: Record<GeoSource, string> = {
  exif: "from the photo's EXIF",
  device: 'from the device at capture',
  manual: 'placed by hand',
}

function describe(geo: DocumentGeo): string {
  const coords = `${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)}`
  const source = geo.source ? SOURCE_LABEL[geo.source] : null
  const accuracy = geo.accuracy != null ? `±${geo.accuracy} m` : null
  return [coords, accuracy, source].filter(Boolean).join(' · ')
}

export function DocumentGeoField({
  value, onChange, idPrefix = 'edit-geo',
}: {
  value: DocumentGeo | null
  onChange: (geo: DocumentGeo | null) => void
  idPrefix?: string
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-action`}>Location</Label>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-xs">
          <MapPin className={value ? 'h-4 w-4 shrink-0 text-info' : 'h-4 w-4 shrink-0 text-muted-foreground'} />
          <span className={value ? 'truncate tabular-nums' : 'truncate text-muted-foreground'}>
            {value ? describe(value) : 'No location on this document'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button
            id={`${idPrefix}-action`}
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Map className="h-3.5 w-3.5" />
            {value ? 'Move pin' : 'Set on map'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Remove location"
              title="Remove location"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>

      {pickerOpen && (
        <LocationPickerSheet
          initial={value}
          onPick={(p) => onChange({ lat: p.lat, lon: p.lon, source: 'manual' })}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
