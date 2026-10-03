import { useRef, useState } from 'react'
import { Aperture, Crosshair, Expand, Flashlight, FlashlightOff, ImageUp, RotateCcw, Shrink, X, ZoomIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CAMERA_RESOLUTIONS, type CameraResolution } from '@/hooks/useWebcam'
import { useLensFeed } from './use-lens-feed'
import type { LensConsumer } from './lens-feed-context'

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

/**
 * Shutter + frozen-frame overlay, rendered INSIDE a (relative) preview box.
 * Live: a round shutter button over the feed. Snapshot: the still covers the
 * video and the results stay put until "Live" resumes the loop.
 */
export function LensSnapshotOverlay() {
  const { running, source, snapshot, takeSnapshot, clearSnapshot, fit } = useLensFeed()
  if (!running) return null
  if (snapshot) {
    return (
      <>
        <img
          src={snapshot}
          alt="Snapshot being searched"
          className={cn('absolute inset-0 h-full w-full bg-black', fit === 'contain' ? 'object-contain' : 'object-cover')}
        />
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
          {source === 'photo' ? 'Photo' : 'Snapshot'}
        </span>
        <button
          type="button"
          onClick={clearSnapshot}
          className="absolute bottom-2 left-1/2 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-black/75"
          title={source === 'photo' ? 'Close the photo and clear its matches' : 'Discard the snapshot and go back to the live feed'}
        >
          {source === 'photo' ? <><X className="h-3.5 w-3.5" /> Close</> : <><RotateCcw className="h-3.5 w-3.5" /> Live</>}
        </button>
      </>
    )
  }
  if (source === 'photo') return null
  return (
    <button
      type="button"
      onClick={takeSnapshot}
      aria-label="Take a snapshot and search it"
      title="Snapshot: freeze this frame and search for similar items"
      className="absolute bottom-2 left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white/90 bg-white/25 text-white shadow-lg backdrop-blur transition-transform hover:bg-white/40 active:scale-90"
    >
      <Aperture className="h-5 w-5" />
    </button>
  )
}

/**
 * A picked image as a JPEG data URI, longest edge capped. createImageBitmap
 * applies EXIF orientation — phone photos are stored sideways with a rotate
 * flag, and an unrotated query embeds as a different picture.
 */
async function readImageFile(file: File, maxDim = 1280, quality = 0.85): Promise<string> {
  let source: ImageBitmap | HTMLImageElement
  let url: string | null = null
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Older Safari: an <img> still honours EXIF orientation when drawn.
    url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    await img.decode()
    source = img
  }
  try {
    const sw = source.width
    const sh = source.height
    const scale = Math.min(1, maxDim / Math.max(sw, sh))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sw * scale)
    canvas.height = Math.round(sh * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    if ('close' in source) source.close()
    if (url) URL.revokeObjectURL(url)
  }
}

/**
 * "Use photo": search a picture from the device instead of the live feed. No
 * `capture` attribute on purpose — phones then offer both the camera app
 * (full resolution, proper autofocus) and the gallery.
 */
export function LensPhotoButton({ consumer, workspaceRef, contextPath, disabled, className }: {
  consumer: LensConsumer
  workspaceRef: string
  contextPath?: string | null
  disabled?: boolean
  className?: string
}) {
  const { searchPhoto } = useLensFeed()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const image = await readImageFile(file)
      await searchPhoto(image, consumer, { workspaceRef, contextPath })
    } catch {
      setError('Could not read that image.')
    } finally {
      setBusy(false)
      // Same file twice in a row must still fire onChange.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy || !workspaceRef}
        className={className}
        title={error ?? 'Search with a photo from the camera app or gallery'}
      >
        <ImageUp className="h-3.5 w-3.5" /> {busy ? 'Reading…' : 'Photo'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  )
}
