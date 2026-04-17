import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, File } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TreeNode } from '@/types/workspace'

function buildPath(parentPath: string, name: string): string {
  return parentPath === '/' ? `/${name}` : `${parentPath}/${name}`
}

interface TreeMiniNodeProps {
  node: TreeNode
  parentPath: string
  selectedPath: string
  onSelect: (path: string) => void
  depth: number
}

function TreeMiniNode({ node, parentPath, selectedPath, onSelect, depth }: TreeMiniNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = node.children && node.children.length > 0
  const nodePath = buildPath(parentPath, node.name)
  const isSelected = selectedPath === nodePath

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-1 rounded cursor-pointer hover:bg-accent/50 transition-colors select-none',
          isSelected && 'bg-accent',
        )}
        style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: '8px' }}
        onClick={() => onSelect(nodePath)}
      >
        <button
          type="button"
          className={cn('shrink-0 text-muted-foreground hover:text-foreground', !hasChildren && 'invisible')}
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        {hasChildren
          ? expanded
            ? <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            : <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          : <File className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        }
        {node.color && (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
        )}
        <span className="text-xs truncate">{node.label || node.name}</span>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map(child => (
            <TreeMiniNode
              key={child.id || child.name}
              node={child}
              parentPath={nodePath}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface TreeMiniProps {
  root: TreeNode | null
  selectedPath: string
  onSelect: (path: string) => void
  isLoading?: boolean
}

export function TreeMini({ root, selectedPath, onSelect, isLoading }: TreeMiniProps) {
  if (isLoading) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">Loading tree...</div>
  }
  if (!root) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">No tree available</div>
  }
  if (!root.children || root.children.length === 0) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">Empty tree</div>
  }

  return (
    <div className="py-1">
      {root.children.map(child => (
        <TreeMiniNode
          key={child.id || child.name}
          node={child}
          parentPath="/"
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  )
}
