import { useLayoutEffect, useRef, type MouseEventHandler, type ReactNode } from 'react'
import { bindDocumentMarquee } from '@/lib/selection-rectangle'

export function DocumentSelectionArea({ scope, selected, onSelectionChange, onContextMenu, children }: {
  scope: string
  selected: ReadonlySet<number>
  onSelectionChange: (ids: Set<number>) => void
  onContextMenu: MouseEventHandler<HTMLDivElement>
  children: ReactNode
}) {
  const area = useRef<HTMLDivElement>(null)
  const latest = useRef({ selected, onSelectionChange })
  useLayoutEffect(() => { latest.current = { selected, onSelectionChange } }, [selected, onSelectionChange])
  // End a gesture before a different folder/view is painted or receives input.
  useLayoutEffect(() => {
    if (!area.current) return
    return bindDocumentMarquee(area.current, {
      getSelection: () => latest.current.selected,
      onSelectionChange: ids => latest.current.onSelectionChange(ids),
    })
  }, [scope])
  return (
    <div ref={area} tabIndex={-1} data-document-selection-area="" onContextMenu={onContextMenu}
      className="relative isolate min-h-0 min-w-0 flex-1 overflow-auto p-2 outline-none">
      {children}
    </div>
  )
}
