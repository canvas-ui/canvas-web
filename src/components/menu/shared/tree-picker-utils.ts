import { useRef } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import type { TreeNode } from '@/types/workspace'

export type TreeTab = 'context' | 'directory'

export interface RowMenuEvent {
  clientX: number
  clientY: number
  path: string
}

export function buildPath(parent: string, name: string) {
  return parent === '/' ? `/${name}` : `${parent}/${name}`
}

export function useRowMenu(path: string, onMenu?: (event: RowMenuEvent) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClick = useRef(false)
  const clear = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }
  const guardClick = (fn: () => void) => () => {
    if (suppressClick.current) { suppressClick.current = false; return }
    fn()
  }

  if (!onMenu) return { handlers: {}, guardClick }
  return {
    guardClick,
    handlers: {
      onContextMenu: (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        onMenu({ clientX: event.clientX, clientY: event.clientY, path })
      },
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType !== 'touch') return
        const { clientX, clientY } = event
        clear()
        timer.current = setTimeout(() => {
          suppressClick.current = true
          onMenu({ clientX, clientY, path })
        }, 500)
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerMove: clear,
    } as const,
  }
}

export function matchesSearch(node: TreeNode, parentPath: string, query: string): boolean {
  const path = buildPath(parentPath, node.name)
  return path.toLowerCase().includes(query)
    || (node.label || '').toLowerCase().includes(query)
    || node.children?.some(child => matchesSearch(child, path, query)) === true
}
