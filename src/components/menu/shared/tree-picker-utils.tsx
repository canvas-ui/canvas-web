import { useRef } from 'react'
import { GitBranch, FolderTree } from 'lucide-react'
import type { TreeNode } from '@/types/workspace'

// Shared between LinkToCard (pick destination paths) and PickDocumentsCard (browse
// to a path, then pick documents within it) — both use the same workspace-list
// step and tree-render step, only their leaf selection semantics differ.

export type TreeTab = 'context' | 'directory'

export const TAB_ICONS: Record<TreeTab, React.ReactNode> = {
  context: <GitBranch className="h-3.5 w-3.5" />,
  directory: <FolderTree className="h-3.5 w-3.5" />,
}
export const TAB_LABELS: Record<TreeTab, string> = {
  context: 'Context tree',
  directory: 'Directory tree',
}

export function buildPath(parent: string, name: string) {
  return parent === '/' ? `/${name}` : `${parent}/${name}`
}

export interface RowMenuEvent {
  clientX: number
  clientY: number
  path: string
}

// Right-click (desktop) + long-press (touch — iOS never fires contextmenu)
// handlers for a tree row. `guardClick` wraps the row's click handler and
// swallows the click that follows a long-press so it doesn't also toggle
// the row's selection.
export function useRowMenu(path: string, onMenu?: (e: RowMenuEvent) => void) {
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
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onMenu({ clientX: e.clientX, clientY: e.clientY, path })
      },
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType !== 'touch') return
        const { clientX, clientY } = e
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
  if (path.toLowerCase().includes(query) || (node.label || '').toLowerCase().includes(query)) return true
  return node.children?.some(c => matchesSearch(c, path, query)) ?? false
}
