/**
 * MenuTreeView — card-style tree for M2 panels.
 * Each node renders as a small card.  Supports full tree operations via
 * context-menu: new folder, rename, remove, copy/cut/paste,
 * lock/unlock layer, show layer content, merge/subtract layers.
 * Ctrl/⌘-click to multi-select source + targets for merge/subtract.
 */
import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronRight, ChevronDown,
  Plus, Trash2, Edit2, Copy, Scissors, Clipboard,
  Layers, MoreHorizontal, Lock, Unlock, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TreeNode } from '@/types/workspace'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MenuTreeViewProps {
  root: TreeNode | null
  selectedPath: string
  pendingPath?: string | null          // path preview before confirmation (context mode)
  onSelect: (path: string) => void
  isLoading?: boolean
  readOnly?: boolean
  onInsertPath?: (path: string, autoCreateLayers?: boolean) => Promise<boolean>
  onRemovePath?: (path: string, recursive?: boolean) => Promise<boolean>
  onRenamePath?: (fromPath: string, newName: string) => Promise<boolean>
  onMovePath?: (from: string, to: string, recursive?: boolean) => Promise<boolean>
  onCopyPath?: (from: string, to: string, recursive?: boolean) => Promise<boolean>
  onLockLayer?: (layerId: string) => Promise<boolean>
  onUnlockLayer?: (layerId: string) => Promise<boolean>
  onMergeLayer?: (layerId: string, targetLayers: string[]) => Promise<any>
  onSubtractLayer?: (layerId: string, targetLayers: string[]) => Promise<any>
}

type ClipboardMode = 'copy' | 'cut'
type Clip = { mode: ClipboardMode; path: string }

// Tracks both path and node.id for layer operations
type LayerRef = { path: string; id: string }

// ─── Context menu ─────────────────────────────────────────────────────────────

interface CtxMenuProps {
  x: number; y: number
  node: TreeNode
  path: string
  onClose: () => void
  onSelect: (path: string) => void
  sourceLayer: LayerRef | null
  targetLayers: Map<string, string>   // path → id
  clipboard: Clip | null
  onInsert?: MenuTreeViewProps['onInsertPath']
  onRemove?: MenuTreeViewProps['onRemovePath']
  onRename?: MenuTreeViewProps['onRenamePath']
  onLock?: MenuTreeViewProps['onLockLayer']
  onUnlock?: MenuTreeViewProps['onUnlockLayer']
  onMerge?: MenuTreeViewProps['onMergeLayer']
  onSubtract?: MenuTreeViewProps['onSubtractLayer']
  onCopy: (path: string) => void
  onCut: (path: string) => void
  onPaste: (target: string) => Promise<void>
}

function CtxMenu({
  x, y, node, path, onClose, onSelect,
  sourceLayer, targetLayers, clipboard,
  onInsert, onRemove, onRename,
  onLock, onUnlock, onMerge, onSubtract,
  onCopy, onCut, onPaste,
}: CtxMenuProps) {

  const hasLayerSel = sourceLayer && targetLayers.size > 0 && (
    sourceLayer.path === path || targetLayers.has(path)
  )
  // Merge/subtract are available when the right-clicked node is the source layer
  // and there's at least one target selected
  const canMergeSubtract = sourceLayer && targetLayers.size > 0 && sourceLayer.path === path

  const run = async (fn: () => Promise<void>) => {
    try { await fn() } catch (err) { alert(err instanceof Error ? err.message : String(err)) }
    onClose()
  }

  const item = (icon: React.ReactNode, label: string, fn: () => Promise<void>, danger = false) => (
    <button
      type="button"
      className={cn(
        'flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent rounded-sm text-left',
        danger && 'text-destructive hover:bg-destructive/10',
      )}
      onClick={() => run(fn)}
    >
      {icon}
      {label}
    </button>
  )

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-[11rem] overflow-hidden rounded-md border bg-popover p-1 shadow-md"
        style={{ left: x, top: y }}
      >
        {/* Show content */}
        {item(<Eye className="w-3 h-3" />, 'Show content', async () => { onSelect(path) })}

        <div className="my-1 h-px bg-border" />

        {/* Structure ops */}
        {onInsert && item(<Plus className="w-3 h-3" />, 'New folder here', async () => {
          const name = prompt('Folder name:')
          if (!name) return
          const full = path === '/' ? `/${name}` : `${path}/${name}`
          await onInsert(full, true)
        })}
        {path !== '/' && onRename && item(<Edit2 className="w-3 h-3" />, 'Rename', async () => {
          const cur = path.split('/').pop() || ''
          const n = prompt('New name:', cur)
          if (!n || n === cur) return
          await onRename(path, n)
        })}

        <div className="my-1 h-px bg-border" />

        {/* Clipboard */}
        {item(<Copy className="w-3 h-3" />, 'Copy', async () => onCopy(path))}
        {item(<Scissors className="w-3 h-3" />, 'Cut', async () => onCut(path))}
        {clipboard && item(
          <Clipboard className="w-3 h-3" />,
          `Paste (${clipboard.mode})`,
          async () => onPaste(path),
        )}

        {/* Remove */}
        {path !== '/' && onRemove && (
          <>
            <div className="my-1 h-px bg-border" />
            {item(<Trash2 className="w-3 h-3" />, 'Remove', async () => {
              if (confirm(`Remove "${path}"?`)) await onRemove(path, false)
            }, true)}
            {item(<Trash2 className="w-3 h-3" />, 'Remove recursive', async () => {
              if (confirm(`Remove "${path}" and all children?`)) await onRemove(path, true)
            }, true)}
          </>
        )}

        {/* Layer: lock / unlock */}
        {(onLock || onUnlock) && (
          <>
            <div className="my-1 h-px bg-border" />
            {node.locked
              ? (onUnlock && item(<Unlock className="w-3 h-3" />, 'Unlock layer', async () => {
                  await onUnlock(node.id)
                }))
              : (onLock && item(<Lock className="w-3 h-3" />, 'Lock layer', async () => {
                  await onLock(node.id)
                }))
            }
          </>
        )}

        {/* Layer: merge / subtract (source must be this node, targets selected) */}
        {canMergeSubtract && (
          <>
            <div className="my-1 h-px bg-border" />
            {onMerge && item(<Layers className="w-3 h-3" />, 'Merge into targets', async () => {
              const tgtIds = Array.from(targetLayers.values())
              await onMerge(node.id, tgtIds)
            })}
            {onSubtract && item(<Layers className="w-3 h-3" />, 'Subtract from targets', async () => {
              const tgtIds = Array.from(targetLayers.values())
              await onSubtract(node.id, tgtIds)
            })}
          </>
        )}

        {/* Hint when targets are selected but this isn't the source */}
        {hasLayerSel && !canMergeSubtract && (
          <>
            <div className="my-1 h-px bg-border" />
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground italic">
              Right-click the source layer to merge/subtract
            </div>
          </>
        )}
      </div>
    </>, document.body
  )
}

// ─── Tree node card ───────────────────────────────────────────────────────────

function buildPath(parent: string, name: string) {
  return parent === '/' ? `/${name}` : `${parent}/${name}`
}

interface CardNodeProps {
  node: TreeNode
  parentPath: string
  depth: number
  selectedPath: string
  pendingPath?: string | null
  readOnly: boolean
  sourceLayer: LayerRef | null
  targetLayers: Map<string, string>
  clipboard: Clip | null
  onSelect: (path: string) => void
  onCtrl: (path: string, id: string) => void
  onCtxMenu: (e: React.MouseEvent, path: string, node: TreeNode) => void
}

function CardNode({
  node, parentPath, depth, selectedPath, pendingPath, readOnly,
  sourceLayer, targetLayers, clipboard,
  onSelect, onCtrl, onCtxMenu,
}: CardNodeProps) {

  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = node.children && node.children.length > 0
  const path = buildPath(parentPath, node.name)
  const isSelected = selectedPath === path
  const isPending = pendingPath === path
  const isSource = sourceLayer?.path === path
  const isTarget = targetLayers.has(path)

  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) { onCtrl(path, node.id); return }
    onSelect(path)
  }

  return (
    <div>
      {/* Card */}
      <div
        className={cn(
          'group relative flex items-center gap-1.5 rounded-l-md px-2 py-1.5 cursor-pointer transition-all',
          'shadow-sm hover:shadow text-xs',
          isSource && 'ring-1 ring-blue-500/40 bg-blue-500/10',
          isTarget && !isSource && 'ring-1 ring-amber-500/40 bg-amber-500/10',
          !isSource && !isTarget && isSelected && 'bg-accent shadow',
          !isSource && !isTarget && isPending && !isSelected && 'bg-accent/50',
          !isSource && !isTarget && !isSelected && !isPending && 'bg-card hover:bg-accent/40',
          node.locked && 'opacity-60',
        )}
        style={{ borderRight: node.color ? `4px solid ${node.color}` : '4px solid transparent' }}
        onClick={handleClick}
        onContextMenu={e => { if (!readOnly) { e.preventDefault(); onCtxMenu(e, path, node) } }}
      >
        {/* Expand chevron */}
        <button
          type="button"
          className={cn('shrink-0 text-muted-foreground hover:text-foreground', !hasChildren && 'invisible')}
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>

        {/* Lock indicator */}
        {node.locked && <Lock className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />}

        {/* Label */}
        <span className="flex-1 truncate font-medium">{node.label || node.name}</span>

        {/* Description hint */}
        {node.description && (
          <span className="hidden group-hover:inline text-[10px] text-muted-foreground truncate max-w-[60px]">
            {node.description}
          </span>
        )}

        {/* ⋯ menu trigger */}
        {!readOnly && (
          <button
            type="button"
            className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted-foreground/10 text-muted-foreground"
            onClick={e => { e.stopPropagation(); onCtxMenu(e, path, node) }}
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="ml-3 mt-0.5 space-y-0.5">
          {node.children.map(child => (
            <CardNode
              key={child.id || child.name}
              node={child}
              parentPath={path}
              depth={depth + 1}
              selectedPath={selectedPath}
              pendingPath={pendingPath}
              readOnly={readOnly}
              sourceLayer={sourceLayer}
              targetLayers={targetLayers}
              clipboard={clipboard}
              onSelect={onSelect}
              onCtrl={onCtrl}
              onCtxMenu={onCtxMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function MenuTreeView({
  root, selectedPath, pendingPath, onSelect, isLoading = false, readOnly = false,
  onInsertPath, onRemovePath, onRenamePath, onMovePath, onCopyPath,
  onLockLayer, onUnlockLayer, onMergeLayer, onSubtractLayer,
}: MenuTreeViewProps) {

  const [clipboard, setClipboard] = useState<Clip | null>(null)
  const [sourceLayer, setSourceLayer] = useState<LayerRef | null>(null)
  const [targetLayers, setTargetLayers] = useState<Map<string, string>>(new Map())
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string; node: TreeNode } | null>(null)

  const openCtxMenu = useCallback((e: React.MouseEvent, path: string, node: TreeNode) => {
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 190)
    const y = Math.min(e.clientY, window.innerHeight - 260)
    setCtxMenu({ x, y, path, node })
  }, [])

  // Ctrl+click: first click = source, subsequent = toggle targets
  const handleCtrl = useCallback((path: string, id: string) => {
    if (!sourceLayer) {
      setSourceLayer({ path, id })
      setTargetLayers(new Map())
    } else if (path === sourceLayer.path) {
      setSourceLayer(null)
      setTargetLayers(new Map())
    } else {
      setTargetLayers(prev => {
        const next = new Map(prev)
        if (next.has(path)) next.delete(path)
        else next.set(path, id)
        return next
      })
    }
  }, [sourceLayer])

  const handlePaste = useCallback(async (target: string) => {
    if (!clipboard || !onMovePath || !onCopyPath) return
    if (clipboard.mode === 'cut') {
      await onMovePath(clipboard.path, target, false)
      setClipboard(null)
    } else {
      await onCopyPath(clipboard.path, target, false)
    }
  }, [clipboard, onMovePath, onCopyPath])

  if (isLoading) return <div className="px-3 py-3 text-xs text-muted-foreground">Loading tree…</div>
  if (!root) return <div className="px-3 py-3 text-xs text-muted-foreground">No tree available</div>
  if (!root.children?.length) return <div className="px-3 py-3 text-xs text-muted-foreground">Empty tree</div>

  // Ctrl+click hint
  const hasSelection = sourceLayer || targetLayers.size > 0

  return (
    <div className="px-2 py-1.5 space-y-0.5">
      {hasSelection && (
        <div className="flex items-center justify-between px-1 pb-1 text-[10px] text-muted-foreground">
          <span>
            {sourceLayer
              ? `Source: ${sourceLayer.path} · ${targetLayers.size} target(s)`
              : 'Select source with ⌃-click'}
          </span>
          <button
            type="button"
            className="hover:text-foreground underline"
            onClick={() => { setSourceLayer(null); setTargetLayers(new Map()) }}
          >
            clear
          </button>
        </div>
      )}

      {root.children.map(child => (
        <CardNode
          key={child.id || child.name}
          node={child}
          parentPath="/"
          depth={0}
          selectedPath={selectedPath}
          pendingPath={pendingPath}
          readOnly={readOnly}
          sourceLayer={sourceLayer}
          targetLayers={targetLayers}
          clipboard={clipboard}
          onSelect={onSelect}
          onCtrl={handleCtrl}
          onCtxMenu={openCtxMenu}
        />
      ))}

      {ctxMenu && (
        <CtxMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          node={ctxMenu.node}
          path={ctxMenu.path}
          onClose={() => setCtxMenu(null)}
          onSelect={onSelect}
          sourceLayer={sourceLayer}
          targetLayers={targetLayers}
          clipboard={clipboard}
          onInsert={!readOnly ? onInsertPath : undefined}
          onRemove={!readOnly ? onRemovePath : undefined}
          onRename={!readOnly ? onRenamePath : undefined}
          onLock={!readOnly ? onLockLayer : undefined}
          onUnlock={!readOnly ? onUnlockLayer : undefined}
          onMerge={!readOnly ? onMergeLayer : undefined}
          onSubtract={!readOnly ? onSubtractLayer : undefined}
          onCopy={path => setClipboard({ mode: 'copy', path })}
          onCut={path => setClipboard({ mode: 'cut', path })}
          onPaste={handlePaste}
        />
      )}
    </div>
  )
}
