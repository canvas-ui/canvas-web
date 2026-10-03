import { Crosshair, Expand, Flashlight, FlashlightOff, Shrink, ZoomIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CAMERA_RESOLUTIONS, type CameraResolution } from '@/hooks/useWebcam'
import { useLensFeed } from './use-lens-feed'

// Camera controls for the running Lens feed, shared by the Filters → Lens tab
// and the Lens applet. Every control only renders when the track supports it:
// zoom falls back to a digital crop, torch/focus need Image Capture support
// (Chrome on Android; iOS Safari and most webcams expose neither).

const selectClass = 'h-7 min-w-0 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring'
const iconBtn = 'flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

const fmtZoom = (z: number) => `${z < 10 ? z.toFixed(1) : Math.round(z)}×`

export function LensCameraControls({ className }: { className?: string }) {
  const { camera, fit, setFit } = useLensFeed()
  if (!camera) return null
  const { devices, prefs, setPrefs, size, zoomRange, zoom, setZoom } = camera
  const canZoom = zoomRange.max > zoomRange.min

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {devices.length > 1 && (
          <select
            className={cn(selectClass, 'max-w-[12rem] flex-1')}
            value={prefs.deviceId ?? ''}
            onChange={(e) => setPrefs({ deviceId: e.target.value || null })}
            title="Camera / lens. On phones with several rear cameras, pick the main or wide one if the picture is too zoomed in."
            aria-label="Camera"
          >
            <option value="">Default rear camera</option>
            {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
          </select>
        )}
        <select
          className={selectClass}
          value={prefs.resolution}
          onChange={(e) => setPrefs({ resolution: e.target.value as CameraResolution })}
          title={size ? `Requested resolution — camera is delivering ${size.width}×${size.height}` : 'Requested resolution'}
          aria-label="Resolution"
        >
          {CAMERA_RESOLUTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setFit(fit === 'contain' ? 'cover' : 'contain')}
          className={iconBtn}
          title={fit === 'contain' ? 'Showing the whole frame — switch to fill the preview' : 'Filling the preview (edges cropped) — switch to the whole frame'}
          aria-label={fit === 'contain' ? 'Fill preview' : 'Fit whole frame'}
        >
          {fit === 'contain' ? <Expand className="h-3.5 w-3.5" /> : <Shrink className="h-3.5 w-3.5" />}
        </button>
        {camera.focusSupported && (
          <button type="button" onClick={() => camera.focusAt()} className={iconBtn} title="Refocus (or tap the preview to focus on a spot)">
            <Crosshair className="h-3.5 w-3.5" /> Focus
          </button>
        )}
        {camera.torchSupported && (
          <button
            type="button"
            onClick={() => camera.setTorch(!camera.torch)}
            className={cn(iconBtn, camera.torch && 'border-foreground text-foreground')}
            aria-pressed={camera.torch}
            title={camera.torch ? 'Torch off' : 'Torch on'}
          >
            {camera.torch ? <Flashlight className="h-3.5 w-3.5" /> : <FlashlightOff className="h-3.5 w-3.5" />}
          </button>
        )}
        {size && <span className="text-[11px] tabular-nums text-muted-foreground">{size.width}×{size.height}</span>}
      </div>

      {canZoom && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground" title={zoomRange.hardware ? 'Optical/sensor zoom' : 'Digital zoom — crops the searched frame too'}>
          <ZoomIn className="h-3.5 w-3.5 shrink-0" />
          <input
            type="range"
            min={zoomRange.min}
            max={zoomRange.max}
            step={zoomRange.step}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            onDoubleClick={() => setZoom(zoomRange.min)}
            className="h-1 min-w-0 flex-1 accent-foreground"
            aria-label="Zoom"
          />
          <button
            type="button"
            onClick={() => setZoom(zoomRange.min)}
            className="w-10 shrink-0 text-right tabular-nums hover:text-foreground"
            title="Reset zoom"
          >
            {fmtZoom(zoom)}
          </button>
        </label>
      )}
    </div>
  )
}
