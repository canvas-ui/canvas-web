export interface SelectionPoint { x: number; y: number }
export interface SelectionRectangle { left: number; top: number; width: number; height: number }

export function selectionRectangle(start: SelectionPoint, end: SelectionPoint): SelectionRectangle {
  return { left: Math.min(start.x, end.x), top: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }
}

export function rectanglesIntersect(a: SelectionRectangle, b: SelectionRectangle): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left
    && a.top < b.top + b.height && a.top + a.height > b.top
}

export function selectDocumentsInRectangle(rectangle: SelectionRectangle, items: { id: number; bounds: SelectionRectangle }[], initial: ReadonlySet<number>, additive: boolean): Set<number> {
  const next = new Set(additive ? initial : [])
  for (const item of items) if (rectanglesIntersect(rectangle, item.bounds)) next.add(item.id)
  return next
}

// Only empty space starts a marquee. Rows keep their native file drag, and
// controls, folders, touch scrolling and portaled dialogs retain their actions.
const INTERACTIVE = '[data-document-id], button, a, input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="dialog"], [role="menu"], [draggable="true"], thead, [data-selection-ignore]'

export function bindDocumentMarquee(area: HTMLElement, options: {
  getSelection: () => ReadonlySet<number>
  onSelectionChange: (ids: Set<number>) => void
}): () => void {
  const win = area.ownerDocument.defaultView!
  let drag: {
    pointerId: number
    start: SelectionPoint
    clientStart: SelectionPoint
    client: SelectionPoint
    initial: Set<number>
    additive: boolean
    active: boolean
  } | null = null
  let overlay: HTMLDivElement | null = null
  let frame = 0
  let lastFrame = 0
  let dirty = false
  let suppressClick = false
  let previousUserSelect = ''

  const viewport = () => {
    const bounds = area.getBoundingClientRect()
    return { left: bounds.left + area.clientLeft, top: bounds.top + area.clientTop, width: area.clientWidth, height: area.clientHeight }
  }
  const contentPoint = (client: SelectionPoint): SelectionPoint => {
    const bounds = viewport()
    return {
      x: Math.max(0, Math.min(bounds.width, client.x - bounds.left)) + area.scrollLeft,
      y: Math.max(0, Math.min(bounds.height, client.y - bounds.top)) + area.scrollTop,
    }
  }
  const update = () => {
    if (!drag?.active || !overlay) return
    const rectangle = selectionRectangle(drag.start, contentPoint(drag.client))
    Object.assign(overlay.style, { left: `${rectangle.left}px`, top: `${rectangle.top}px`, width: `${rectangle.width}px`, height: `${rectangle.height}px` })
    const origin = viewport()
    const items = Array.from(area.querySelectorAll<HTMLElement>('[data-document-id]'))
      .filter(item => item.getClientRects().length > 0)
      .map(item => {
        const bounds = item.getBoundingClientRect()
        return { id: Number(item.dataset.documentId), bounds: {
          left: bounds.left - origin.left + area.scrollLeft, top: bounds.top - origin.top + area.scrollTop,
          width: bounds.width, height: bounds.height,
        } }
      })
    options.onSelectionChange(selectDocumentsInRectangle(rectangle, items, drag.initial, drag.additive))
  }
  const scrollSpeed = (position: number, start: number, size: number) => {
    const edge = Math.min(40, size / 4)
    if (position < start + edge) return -18 * Math.min(1, (start + edge - position) / edge)
    if (position > start + size - edge) return 18 * Math.min(1, (position - start - size + edge) / edge)
    return 0
  }
  const tick = (time: number) => {
    if (!drag?.active) return
    const bounds = viewport()
    const scale = lastFrame ? Math.min(2, (time - lastFrame) / (1000 / 60)) : 1
    lastFrame = time
    const { scrollTop, scrollLeft } = area
    area.scrollTop += scrollSpeed(drag.client.y, bounds.top, bounds.height) * scale
    area.scrollLeft += scrollSpeed(drag.client.x, bounds.left, bounds.width) * scale
    if (dirty || area.scrollTop !== scrollTop || area.scrollLeft !== scrollLeft) { update(); dirty = false }
    frame = win.requestAnimationFrame(tick)
  }
  const finish = (cancelled = false) => {
    if (!drag) return
    const ended = drag
    drag = null
    win.cancelAnimationFrame(frame)
    frame = 0
    lastFrame = 0
    overlay?.remove()
    overlay = null
    if (ended.active) {
      area.style.userSelect = previousUserSelect
      suppressClick = true
      if (cancelled) options.onSelectionChange(ended.initial)
    }
    if (area.hasPointerCapture(ended.pointerId)) area.releasePointerCapture(ended.pointerId)
  }
  const pointerDown = (event: PointerEvent) => {
    suppressClick = false
    if (drag || event.button !== 0 || !event.isPrimary || event.pointerType === 'touch') return
    const target = event.target as HTMLElement
    if (!area.contains(target) || target.closest(INTERACTIVE)) return
    const bounds = viewport()
    // Leave native scrollbars alone.
    if (event.clientX < bounds.left || event.clientX >= bounds.left + bounds.width
      || event.clientY < bounds.top || event.clientY >= bounds.top + bounds.height) return
    const client = { x: event.clientX, y: event.clientY }
    drag = { pointerId: event.pointerId, start: contentPoint(client), clientStart: client, client,
      initial: new Set(options.getSelection()), additive: event.ctrlKey || event.metaKey || event.shiftKey, active: false }
    event.preventDefault()
    area.focus({ preventScroll: true })
    area.setPointerCapture(event.pointerId)
  }
  const pointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (!(event.buttons & 1)) { finish(); return }
    drag.client = { x: event.clientX, y: event.clientY }
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.clientStart.x, event.clientY - drag.clientStart.y) < 4) return
      drag.active = true
      previousUserSelect = area.style.userSelect
      area.style.userSelect = 'none'
      win.getSelection()?.removeAllRanges()
      overlay = area.ownerDocument.createElement('div')
      overlay.setAttribute('aria-hidden', 'true')
      overlay.dataset.selectionRectangle = ''
      overlay.className = 'pointer-events-none absolute z-20 border border-info bg-info/15'
      area.append(overlay)
      frame = win.requestAnimationFrame(tick)
    }
    dirty = true
    event.preventDefault()
  }
  const pointerUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    drag.client = { x: event.clientX, y: event.clientY }
    if (drag.active) update()
    else if (!drag.additive) options.onSelectionChange(new Set())
    finish()
  }
  const cancel = () => finish(true)
  const pointerCancel = (event: PointerEvent) => { if (event.pointerId === drag?.pointerId) cancel() }
  const keyDown = (event: KeyboardEvent) => {
    if (drag && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
  }
  const click = (event: MouseEvent) => {
    if (!suppressClick) return
    suppressClick = false
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const scroll = () => { dirty = true }
  area.addEventListener('pointerdown', pointerDown)
  area.addEventListener('pointermove', pointerMove)
  area.addEventListener('pointerup', pointerUp)
  area.addEventListener('pointercancel', pointerCancel)
  area.addEventListener('lostpointercapture', pointerCancel)
  area.addEventListener('click', click, true)
  area.addEventListener('scroll', scroll, true)
  win.addEventListener('keydown', keyDown, true)
  win.addEventListener('blur', cancel)
  return () => {
    // Navigation/unmount must not restore the previous folder's selection.
    finish()
    area.removeEventListener('pointerdown', pointerDown)
    area.removeEventListener('pointermove', pointerMove)
    area.removeEventListener('pointerup', pointerUp)
    area.removeEventListener('pointercancel', pointerCancel)
    area.removeEventListener('lostpointercapture', pointerCancel)
    area.removeEventListener('click', click, true)
    area.removeEventListener('scroll', scroll, true)
    win.removeEventListener('keydown', keyDown, true)
    win.removeEventListener('blur', cancel)
  }
}
