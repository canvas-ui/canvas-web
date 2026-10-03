import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Webcam preview + frame capture, modeled on useVoiceRecorder's getUserMedia
 * handling. Attach `videoRef` to a <video muted playsInline> element, call
 * start()/stop(); captureFrame() grabs the current frame as a JPEG data URI
 * (downscaled — query frames don't need full sensor resolution).
 *
 * getUserMedia is secure-context-only: on LAN-over-http `start()` reports a
 * clear error instead of throwing (same gotcha useGeotag documents).
 *
 * Camera controls: a bare `facingMode: 'environment'` lets the browser pick
 * the lens and the mode, and on multi-camera phones that is routinely the
 * telephoto (too zoomed in) at a low resolution with fixed focus (blurry).
 * So the device and resolution are user prefs (persisted per browser), and
 * zoom / torch / focus are driven through the Image Capture constraints when
 * the track advertises them. Without hardware zoom, zoom is digital: a centre
 * crop applied identically to the preview (via `zoom`) and to captureFrame(),
 * so what you see is what gets searched.
 */

export type CameraResolution = '720p' | '1080p' | '4k'

export const CAMERA_RESOLUTIONS: { id: CameraResolution; label: string; width: number; height: number }[] = [
  { id: '720p', label: '720p', width: 1280, height: 720 },
  { id: '1080p', label: '1080p', width: 1920, height: 1080 },
  { id: '4k', label: '4K', width: 3840, height: 2160 },
]

export interface CameraPrefs {
  /** null = let the browser pick the rear camera. */
  deviceId: string | null
  resolution: CameraResolution
}

export interface CameraDevice {
  deviceId: string
  label: string
}

export interface CameraControls {
  devices: CameraDevice[]
  prefs: CameraPrefs
  setPrefs: (next: Partial<CameraPrefs>) => void
  /** Actual negotiated frame size, e.g. to show 1920×1080. */
  size: { width: number; height: number } | null
  /** Zoom range; `hardware` false = digital centre crop. */
  zoomRange: { min: number; max: number; step: number; hardware: boolean }
  zoom: number
  setZoom: (z: number) => void
  torchSupported: boolean
  torch: boolean
  setTorch: (on: boolean) => void
  focusSupported: boolean
  /** Normalised (0..1) point in the frame, or omit to refocus the centre. */
  focusAt: (point?: { x: number; y: number }) => void
}

// Image Capture extensions — lib.dom only types a few of these, and only on
// the constraint side.
interface ExtCapabilities extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step?: number }
  torch?: boolean
  focusMode?: string[]
}
type ExtConstraintSet = MediaTrackConstraintSet & {
  zoom?: number
  torch?: boolean
  focusMode?: string
  pointsOfInterest?: { x: number; y: number }[]
}

const PREFS_KEY = 'canvas.lens.camera'
const DIGITAL_ZOOM = { min: 1, max: 4, step: 0.1, hardware: false }

function loadPrefs(): CameraPrefs {
  const fallback: CameraPrefs = { deviceId: null, resolution: '1080p' }
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null') as Partial<CameraPrefs> | null
    if (!raw) return fallback
    return {
      deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : null,
      resolution: CAMERA_RESOLUTIONS.some((r) => r.id === raw.resolution) ? raw.resolution! : fallback.resolution,
    }
  } catch {
    return fallback
  }
}

function videoConstraints(prefs: CameraPrefs, withDevice: boolean): MediaTrackConstraints {
  const res = CAMERA_RESOLUTIONS.find((r) => r.id === prefs.resolution) ?? CAMERA_RESOLUTIONS[1]
  return {
    ...(withDevice && prefs.deviceId ? { deviceId: { exact: prefs.deviceId } } : { facingMode: 'environment' }),
    width: { ideal: res.width },
    height: { ideal: res.height },
  }
}

export function useWebcam(opts: { onEnded?: () => void } = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  // Latest onEnded without re-creating callbacks per render.
  const onEndedRef = useRef(opts.onEnded)
  useEffect(() => { onEndedRef.current = opts.onEnded })
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [active, setActive] = useState(false)
  // Exposed so surfaces other than `videoRef` can bind the same feed — the
  // Lens widget previews the stream while the panel that started it is gone.
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [prefs, setPrefsState] = useState<CameraPrefs>(loadPrefs)
  const prefsRef = useRef(prefs)
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [isCamera, setIsCamera] = useState(false)
  const [caps, setCaps] = useState<ExtCapabilities | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoomState] = useState(1)
  // Digital zoom is read by captureFrame() — a ref, so the loop never goes stale.
  const digitalZoomRef = useRef(1)
  const [torch, setTorchState] = useState(false)
  const focusTimerRef = useRef<number | null>(null)

  const track = () => streamRef.current?.getVideoTracks()[0] ?? null

  const apply = useCallback(async (set: ExtConstraintSet) => {
    const t = track()
    if (!t) return false
    try {
      await t.applyConstraints({ advanced: [set as MediaTrackConstraintSet] })
      return true
    } catch {
      return false
    }
  }, [])

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      // Labels are empty until a permission grant — only list after one.
      const cams = all.filter((d) => d.kind === 'videoinput' && d.deviceId)
      setDevices(cams.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })))
    } catch { /* enumerate unsupported — the picker just stays hidden */ }
  }, [])

  const stop = useCallback(() => {
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStream(null)
    setActive(false)
    setIsCamera(false)
    setCaps(null)
    setSize(null)
    setZoomState(1)
    digitalZoomRef.current = 1
    setTorchState(false)
  }, [])

  const adopt = useCallback(async (stream: MediaStream, camera: boolean) => {
    streamRef.current = stream
    // The user can end a screen share from the browser's own UI — mirror that
    // into our state so the loop shuts down instead of capturing black frames.
    stream.getVideoTracks().forEach((t) => { t.onended = () => { stop(); onEndedRef.current?.() } })
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      await videoRef.current.play().catch(() => {})
    }
    const t = stream.getVideoTracks()[0]
    const s = t?.getSettings()
    setSize(s?.width && s?.height ? { width: s.width, height: s.height } : null)
    setIsCamera(camera)
    setTorchState(false)
    if (camera && t) {
      const c = (t.getCapabilities?.() ?? {}) as ExtCapabilities
      setCaps(c)
      // Continuous autofocus is not the default everywhere; a fixed focus
      // distance is the usual reason a phone feed looks soft up close.
      if (c.focusMode?.includes('continuous')) await apply({ focusMode: 'continuous' })
      const settingsZoom = (t.getSettings() as { zoom?: number }).zoom
      setZoomState(c.zoom ? (settingsZoom ?? c.zoom.min) : 1)
      digitalZoomRef.current = 1
      void refreshDevices()
    }
    setStream(stream)
    setActive(true)
  }, [stop, apply, refreshDevices])

  const openCamera = useCallback(async (p: CameraPrefs) => {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: videoConstraints(p, true), audio: false })
    } catch (err) {
      // A remembered camera that went away (unplugged webcam, new phone):
      // fall back to the default rear camera rather than failing outright.
      const name = (err as DOMException)?.name
      if (p.deviceId && (name === 'OverconstrainedError' || name === 'NotFoundError' || name === 'NotReadableError')) {
        return navigator.mediaDevices.getUserMedia({ video: videoConstraints(p, false), audio: false })
      }
      throw err
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    if (!window.isSecureContext) {
      setError('Camera needs a secure context (https or localhost).')
      return false
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera API not available in this browser.')
      return false
    }
    try {
      const stream = await openCamera(prefsRef.current)
      await adopt(stream, true)
      return true
    } catch (err) {
      const name = (err as DOMException)?.name
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission denied.'
          : name === 'NotFoundError'
            ? 'No camera found.'
            : `Camera failed: ${(err as Error)?.message || name || 'unknown error'}`,
      )
      setActive(false)
      return false
    }
  }, [adopt, openCamera])

  /** Same pipeline, screen instead of camera (desktop-recording refine). */
  const startScreen = useCallback(async () => {
    setError(null)
    if (!window.isSecureContext) {
      setError('Screen capture needs a secure context (https or localhost).')
      return false
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('Screen capture API not available in this browser.')
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      await adopt(stream, false)
      return true
    } catch (err) {
      const name = (err as DOMException)?.name
      setError(name === 'NotAllowedError' ? 'Screen capture cancelled.' : `Screen capture failed: ${(err as Error)?.message || name || 'unknown error'}`)
      setActive(false)
      return false
    }
  }, [adopt])

  // Switching lens or resolution re-opens the camera in place: the old tracks
  // are released first (many phones allow only one open camera), and the
  // caller's session — the Lens loop — keeps running across the swap.
  const setPrefs = useCallback((next: Partial<CameraPrefs>) => {
    const merged = { ...prefsRef.current, ...next }
    prefsRef.current = merged
    setPrefsState(merged)
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(merged)) } catch { /* ignore */ }
    if (!streamRef.current || !isCamera) return
    streamRef.current.getTracks().forEach((t) => { t.onended = null; t.stop() })
    streamRef.current = null
    // The old tracks are already gone: a failed re-open must end the session
    // rather than leave the caller searching a frozen last frame.
    void start().then((ok) => { if (!ok) { stop(); onEndedRef.current?.() } })
  }, [isCamera, start, stop])

  const setZoom = useCallback((z: number) => {
    setZoomState(z)
    if (caps?.zoom) void apply({ zoom: z })
    else digitalZoomRef.current = z
  }, [caps, apply])

  const setTorch = useCallback((on: boolean) => {
    void apply({ torch: on }).then((ok) => { if (ok) setTorchState(on) })
  }, [apply])

  const focusSupported = !!caps?.focusMode?.some((m) => m === 'single-shot' || m === 'continuous')
  const focusAt = useCallback((point?: { x: number; y: number }) => {
    const modes = caps?.focusMode ?? []
    if (!modes.length) return
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current)
    const supported = navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean | undefined>
    const poi = point && supported.pointsOfInterest ? { pointsOfInterest: [point] } : {}
    // single-shot forces a fresh focus pass; drop back to continuous after it
    // so the live feed keeps tracking as the camera moves.
    if (modes.includes('single-shot')) {
      void apply({ ...poi, focusMode: 'single-shot' })
      if (modes.includes('continuous')) {
        focusTimerRef.current = window.setTimeout(() => void apply({ ...poi, focusMode: 'continuous' }), 1500)
      }
    } else {
      void apply({ ...poi, focusMode: 'continuous' })
    }
  }, [caps, apply])

  /** Current frame as a JPEG data URI, longest edge capped at `maxDim`. */
  const captureFrame = useCallback((maxDim = 640, quality = 0.72): string | null => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth) return null
    // Digital zoom: the centred 1/z crop — the same region the preview shows.
    const dz = Math.max(1, digitalZoomRef.current)
    const sw = video.videoWidth / dz
    const sh = video.videoHeight / dz
    const sx = (video.videoWidth - sw) / 2
    const sy = (video.videoHeight - sh) / 2
    const scale = Math.min(1, maxDim / Math.max(sw, sh))
    const w = Math.round(sw * scale)
    const h = Math.round(sh * scale)
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
    const canvas = canvasRef.current
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  }, [])

  useEffect(() => stop, [stop])

  const camera = useMemo<CameraControls | null>(() => isCamera
    ? {
        devices,
        prefs,
        setPrefs,
        size,
        zoomRange: caps?.zoom
          ? { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1, hardware: true }
          : DIGITAL_ZOOM,
        zoom,
        setZoom,
        torchSupported: !!caps?.torch,
        torch,
        setTorch,
        focusSupported,
        focusAt,
      }
    : null, [isCamera, devices, prefs, setPrefs, size, caps, zoom, setZoom, torch, setTorch, focusSupported, focusAt])

  return { videoRef, stream, active, error, start, startScreen, stop, captureFrame, camera }
}
