// A small movement tolerance allows finger jitter while scrolling cancels the
// gesture. Keep click suppression until the next click or fresh pointer down.
export function createLongPress() {
  let timer: ReturnType<typeof setTimeout> | undefined
  let origin: { x: number; y: number } | undefined
  let fired = false
  const cancel = () => { clearTimeout(timer); timer = undefined; origin = undefined }
  return {
    cancel,
    start(x: number, y: number, open: () => void) {
      cancel()
      fired = false
      origin = { x, y }
      timer = setTimeout(() => { timer = undefined; fired = true; open() }, 500)
    },
    move(x: number, y: number) {
      if (origin && Math.hypot(x - origin.x, y - origin.y) > 10) cancel()
    },
    consumeClick() { const suppress = fired; fired = false; return suppress },
    contextMenu() {
      const duplicate = fired
      if (origin) fired = true
      cancel()
      return duplicate
    },
    reset() { cancel(); fired = false },
  }
}
