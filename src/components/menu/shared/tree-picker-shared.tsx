import { useState } from 'react'
import { ChevronRight, ChevronDown, GitBranch, FolderTree } from 'lucide-react'
import { Icon } from '@iconify/react'
import type { TreeNode } from '@/types/workspace'
import { getLayerStyle, DEFAULT_FOLDER_ICON, DEFAULT_CANVAS_ICON, DEFAULT_WORKSPACE_ICON } from '@/lib/layer-style'
import { cn } from '@/lib/utils'
// Workspace is a global type declared in src/types/api.d.ts

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

export function matchesSearch(node: TreeNode, parentPath: string, query: string): boolean {
  const path = buildPath(parentPath, node.name)
  if (path.toLowerCase().includes(query) || (node.label || '').toLowerCase().includes(query)) return true
  return node.children?.some(c => matchesSearch(c, path, query)) ?? false
}

// Single tree row — mirrors the MenuTreeView card style, multi-select via the
// same selected highlight (no checkbox), so it matches the normal tree visually.
export function LinkNode({
  node, parentPath, query, selected, onToggle,
}: {
  node: TreeNode
  parentPath: string
  query: string
  selected: Set<string>
  onToggle: (path: string) => void
}) {
  const path = buildPath(parentPath, node.name)
  const hasChildren = !!node.children?.length
  const [expanded, setExpanded] = useState(false)

  if (query && !matchesSearch(node, parentPath, query)) return null

  const shouldExpand = expanded || query.length > 0
  const isSelected = selected.has(path)
  const isCanvas = node.type === 'canvas'
  const style = getLayerStyle(node)

  return (
    <div>
      <div
        className={cn(
          'group relative flex min-h-10 items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-all select-none text-sm shadow-sm hover:shadow',
          'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:transition-colors',
          isSelected
            ? 'bg-primary/[0.08] hover:bg-primary/[0.12] before:bg-primary'
            : 'bg-card hover:bg-primary/[0.04] before:bg-transparent',
        )}
        onClick={() => onToggle(path)}
        title={path}
      >
        <button
          type="button"
          className={cn('shrink-0 text-muted-foreground hover:text-foreground', !hasChildren && 'invisible')}
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        >
          {shouldExpand ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <Icon
          icon={style.icon || (isCanvas ? DEFAULT_CANVAS_ICON : DEFAULT_FOLDER_ICON)}
          width={16}
          height={16}
          color={style.color || undefined}
          className={cn('shrink-0', !style.color && (isCanvas ? 'text-violet-500' : 'text-muted-foreground'))}
        />

        <span className="flex-1 truncate font-medium" title={node.description || undefined}>
          {node.label || node.name}
        </span>
      </div>

      {shouldExpand && hasChildren && (
        <div className="ml-[22px] mt-1.5 space-y-1.5">
          {node.children!.map(child => (
            <LinkNode
              key={child.id || child.name}
              node={child}
              parentPath={path}
              query={query}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Step 1 of the two-step slide shell — WorkspaceList.tsx row styling, minus
// manage controls (Start/Stop/Settings).
export function WorkspaceListStep({
  workspaces, loading, onPick,
}: {
  workspaces: Workspace[]
  loading: boolean
  onPick: (name: string) => void
}) {
  if (loading && workspaces.length === 0) {
    return <div className="px-2 py-3 text-xs text-muted-foreground">Loading…</div>
  }
  if (workspaces.length === 0) {
    return <div className="px-2 py-3 text-xs text-muted-foreground">No workspaces found</div>
  }
  return (
    <div className="space-y-1.5">
      {workspaces.map(ws => (
        <div
          key={ws.id || ws.name}
          onClick={() => onPick(ws.name)}
          className="group relative flex cursor-pointer items-center gap-2 rounded-md bg-card px-3 py-2.5 shadow-sm transition-all hover:bg-accent/50 hover:shadow"
          style={{ borderRight: `6px solid ${ws.color || 'transparent'}`, borderRadius: ws.color ? '6px 0 0 6px' : undefined }}
        >
          <Icon icon={ws.icon || DEFAULT_WORKSPACE_ICON} width={18} height={18} color={ws.color || undefined} className={cn('shrink-0', !ws.color && 'text-muted-foreground')} />
          <span className="flex-1 truncate text-sm font-medium">{ws.label || ws.name}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      ))}
    </div>
  )
}
