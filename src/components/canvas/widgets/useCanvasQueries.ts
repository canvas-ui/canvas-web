import { useCallback, useMemo, useState } from 'react'
import type { WidgetCanvasContext } from '../widget-types'

// The canvas-level search stack, shared by every data widget (gallery, mosaic,
// documents). When the canvas is editable the stack lives on the canvas context
// (`canvas.canvasQueries` / `setCanvasQueries`) so all widgets read one query
// and it bakes into `querySpec.query` on Save. On a read-only/public view there
// is no setter, so it falls back to ephemeral local state — a per-viewer
// refinement that is never persisted. Each term narrows the previous set.
//
// `onChange` lets a widget reset its pagination to page 1 when the stack moves.
export function useCanvasQueries(canvas: WidgetCanvasContext, onChange?: () => void) {
  const shared = typeof canvas.setCanvasQueries === 'function'
  const [local, setLocal] = useState<string[]>(canvas.canvasQueries ?? [])
  const queries = useMemo(
    () => (shared ? (canvas.canvasQueries ?? []) : local),
    [shared, canvas.canvasQueries, local],
  )

  const setQueries = useCallback((next: string[]) => {
    if (shared) canvas.setCanvasQueries!(next)
    else setLocal(next)
    onChange?.()
  }, [shared, canvas, onChange])

  const runSearch = useCallback((raw: string) => {
    const term = raw.trim()
    if (!term || queries.includes(term)) return
    setQueries([...queries, term])
  }, [queries, setQueries])

  // index < 0 clears the whole stack (DocumentList / ImageGridToolbar convention).
  const removeQuery = useCallback((index: number) => {
    setQueries(index < 0 ? [] : queries.filter((_, i) => i !== index))
  }, [queries, setQueries])

  const clearSearch = useCallback(() => setQueries([]), [setQueries])

  return { queries, runSearch, removeQuery, clearSearch }
}
