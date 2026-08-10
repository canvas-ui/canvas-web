import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Webcam preview + frame capture, modeled on useVoiceRecorder's getUserMedia
 * handling. Attach `videoRef` to a <video muted playsInline> element, call
 * start()/stop(); captureFrame() grabs the current frame as a JPEG data URI
 * (downscaled — query frames don't need full sensor resolution).
 *
 * getUserMedia is secure-context-only: on LAN-over-http `start()` reports a
 * clear error instead of throwing (same gotcha useGeotag documents).
 */
export function useWebcam(opts: { onEnded?: () => void } = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  // Latest onEnded without re-creating callbacks per render.
  const onEndedRef = useRef(opts.onEnded)
  useEffect(() => { onEndedRef.current = opts.onEnded })
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setActive(false)
  }, [])

  const adopt = useCallback(async (stream: MediaStream) => {
    streamRef.current = stream
    // The user can end a screen share from the browser's own UI — mirror that
    // into our state so the loop shuts down instead of capturing black frames.
    stream.getVideoTracks().forEach((t) => { t.onended = () => { stop(); onEndedRef.current?.() } })
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      await videoRef.current.play().catch(() => {})
    }
    setActive(true)
  }, [stop])

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      await adopt(stream)
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
  }, [adopt])

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
      await adopt(stream)
      return true
    } catch (err) {
      const name = (err as DOMException)?.name
      setError(name === 'NotAllowedError' ? 'Screen capture cancelled.' : `Screen capture failed: ${(err as Error)?.message || name || 'unknown error'}`)
      setActive(false)
      return false
    }
  }, [adopt])

  /** Current frame as a JPEG data URI, longest edge capped at `maxDim`. */
  const captureFrame = useCallback((maxDim = 640, quality = 0.72): string | null => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth) return null
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight))
    const w = Math.round(video.videoWidth * scale)
    const h = Math.round(video.videoHeight * scale)
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
    const canvas = canvasRef.current
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  }, [])

  useEffect(() => stop, [stop])

  return { videoRef, active, error, start, startScreen, stop, captureFrame }
}
