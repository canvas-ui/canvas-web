import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Pinch/double-tap zoomable image.
 *
 * Why this exists: a 2560×1440 screenshot shown on a 360px-wide phone fits to
 * ~360×202 — a strip in which no text is readable. The browser's own pinch-zoom
 * is not an answer inside an app shell (the PWA viewport is user-scalable=no,
 * and it would zoom the chrome along with the image), so the viewer has to
 * provide the gesture itself.
 *
 * Gestures: double-tap (or double-click) toggles between fit and "fills the
 * screen", pinch scales continuously, drag pans while zoomed. All of it runs on
 * pointer events, so a mouse gets the same behaviour as a finger.
 */

const MIN_SCALE = 1
const MAX_SCALE = 8
// A double tap is two taps close in time AND in place — the slop is generous
// because a thumb on a phone lands a few px off on the second tap.
const DOUBLE_TAP_MS = 320
const TAP_SLOP_PX = 28
// Floor for the double-tap step: on an already-tall portrait image "fill the
// screen" is barely a zoom, and a double tap that does almost nothing reads as
// broken.
const MIN_DOUBLE_TAP_SCALE = 2.5

interface View {
  scale: number
  x: number
  y: number
}

const FIT: View = { scale: 1, x: 0, y: 0 }

export function ZoomableImage({
  src,
  alt,
  className = '',
  onZoomChange,
}: {
  src: string
  alt: string
  /** Applied to the <img>; sizing/fitting stays the caller's business. */
  className?: string
  /** Fires when the view leaves / returns to the fitted state. */
  onZoomChange?: (zoomed: boolean) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [view, setView] = useState<View>(FIT)

  // Live pointer set — pinch needs two, pan needs one, and both have to survive
  // re-renders, so this is a ref rather than state.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ dist: number; scale: number; cx: number; cy: number } | null>(null)
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null)
  const moved = useRef(false)
  // A finger is currently driving the transform. State, not a ref, because the
  // rendered style depends on it: transitions are ON for a double-tap step and
  // OFF while dragging, where a 160ms ease would trail the finger.
  const [interacting, setInteracting] = useState(false)

  // A new image is a new subject: never inherit the previous one's zoom. Done
  // as a render-time adjustment rather than an effect so the fitted view is the
  // FIRST thing painted for the new src — an effect would show one frame of the
  // new image at the old image's zoom.
  const [renderedSrc, setRenderedSrc] = useState(src)
  if (renderedSrc !== src) {
    setRenderedSrc(src)
    setView(FIT)
  }

  useEffect(() => { onZoomChange?.(view.scale > 1.001) }, [view.scale, onZoomChange])

  // Keep the image inside its frame: past the fitted size the picture may be
  // dragged only as far as its own overflow, so a pan can never strand the
  // subject off screen with empty background in view.
  const clamp = useCallback((next: View): View => {
    const host = hostRef.current
    const img = imgRef.current
    if (!host || !img) return next
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale))
    // offsetWidth/Height are the LAID OUT size (object-contain result), which
    // the transform does not affect — the overflow math needs that, not the
    // painted size a getBoundingClientRect() would report.
    const maxX = Math.max(0, (img.offsetWidth * scale - host.clientWidth) / 2)
    const maxY = Math.max(0, (img.offsetHeight * scale - host.clientHeight) / 2)
    return {
      scale,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    }
  }, [])

  // Scale about a point, keeping whatever is under the finger under the finger.
  const zoomTo = useCallback((scale: number, clientX: number, clientY: number) => {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const px = clientX - rect.left - rect.width / 2
    const py = clientY - rect.top - rect.height / 2
    setView((prev) => {
      const ratio = scale / prev.scale
      return clamp({
        scale,
        x: px - (px - prev.x) * ratio,
        y: py - (py - prev.y) * ratio,
      })
    })
  }, [clamp])

  // The double-tap step: enough to fill the frame on the tighter axis (a 16:9
  // shot on a portrait phone goes edge-to-edge vertically), never past the
  // image's own pixels — zooming into interpolation helps nobody.
  const doubleTapScale = useCallback(() => {
    const host = hostRef.current
    const img = imgRef.current
    if (!host || !img || !img.offsetWidth || !img.offsetHeight) return MIN_DOUBLE_TAP_SCALE
    const cover = Math.max(host.clientWidth / img.offsetWidth, host.clientHeight / img.offsetHeight)
    const natural = Math.max(
      img.naturalWidth / img.offsetWidth,
      img.naturalHeight / img.offsetHeight,
    ) || MAX_SCALE
    const target = Math.max(cover, MIN_DOUBLE_TAP_SCALE)
    return Math.min(MAX_SCALE, Math.max(MIN_DOUBLE_TAP_SCALE, Math.min(target, natural)))
  }, [])

  const toggleZoom = useCallback((clientX: number, clientY: number) => {
    if (view.scale > 1.001) setView(FIT)
    else zoomTo(doubleTapScale(), clientX, clientY)
  }, [view.scale, zoomTo, doubleTapScale])

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved.current = false
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: view.scale,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      }
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (gesture.current.dist > 0) {
        moved.current = true
        setInteracting(true)
        zoomTo(gesture.current.scale * (dist / gesture.current.dist), gesture.current.cx, gesture.current.cy)
      }
      return
    }

    // Single pointer: pan, but only when there is something to pan to. At fit
    // scale a drag is left alone so the surrounding overlay keeps its own
    // gestures (tap-to-close, and any future swipe-to-next).
    if (view.scale <= 1.001) return
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) { moved.current = true; setInteracting(true) }
    setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }))
  }

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) gesture.current = null
    if (pointers.current.size === 0) setInteracting(false)

    if (moved.current) { lastTap.current = null; return }
    const now = e.timeStamp
    const prev = lastTap.current
    if (
      prev
      && now - prev.t < DOUBLE_TAP_MS
      && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < TAP_SLOP_PX
    ) {
      lastTap.current = null
      toggleZoom(e.clientX, e.clientY)
      return
    }
    lastTap.current = { t: now, x: e.clientX, y: e.clientY }
  }

  // Desktop nicety: wheel zooms about the cursor. Plain wheel (not ctrl-only) —
  // inside a lightbox there is nothing else a wheel could mean.
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const next = view.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)
    if (next <= MIN_SCALE) setView(FIT)
    else zoomTo(Math.min(MAX_SCALE, next), e.clientX, e.clientY)
  }

  const zoomed = view.scale > 1.001

  return (
    <div
      ref={hostRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      // touch-action:none is what makes the gestures ours: without it the
      // engine claims the pinch and the drag before a pointermove ever lands.
      style={{ touchAction: 'none', cursor: zoomed ? 'grab' : 'zoom-in' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onWheel={onWheel}
      onDoubleClick={(e) => {
        // Mouse double-click arrives as a real dblclick too; the tap detector
        // above already handled it, so this only covers pointer types that
        // don't emit the paired taps (some trackpads, assistive devices).
        if (!zoomed) toggleZoom(e.clientX, e.clientY)
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        className={className}
        style={{
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
          transformOrigin: 'center center',
          // Snap back / step up in one motion, but never animate a live pinch
          // or drag — that lags the finger.
          transition: interacting ? 'none' : 'transform 160ms ease-out',
          willChange: 'transform',
        }}
      />
    </div>
  )
}
