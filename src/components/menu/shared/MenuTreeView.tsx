/**
 * MenuTreeView — card-style tree for M2 panels.
 * Supports full tree operations via context-menu: new folder (inline),
 * rename, remove, copy/cut/paste, lock/unlock layer, show layer content,
 * merge/subtract layers. Ctrl/⌘-click to multi-select source + targets.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
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
  pendingPath?: string | null
  onSelect: (path: string) => void
  isLoading?: boolean
  readOnly?: boolean
  rootLabel?: string
  contentPath?: string | null
  onShowContent?: (path: string) => void
  onInsertPath?: (path: string, autoCreateLayers?: boolean) => Promise<boolean>
  onRemovePath?: (path: string, recursive?: boolean) => Promise<boolean>
  onRenamePath?: (fromPath: string, newName: string) => Promise<boolean>
  onMovePath?: (from: string, to: string, recursive?: boolean) => Promise<boolean>
  onCopyPath?: (from: string, to: string, recursive?: boolean) => Promise<boolean>
  onLockLayer?: (layerId: string) => Promise<boolean>
  onUnlockLayer?: (layerId: string) => Promise<boolean>
  onDestroyLayer?: (layerId: string) => Promise<boolean>
  onMergeLayer?: (layerId: string, targetLayers: string[]) => Promise<any>
  onSubtractLayer?: (layerId: string, targetLayers: string[]) => Promise<any>
  searchQuery?: string
}

type ClipboardMode = 'copy' | 'cut'
type Clip = { mode: ClipboardMode; path: string }
type LayerRef = { path: string; id: string }

// ─── Context menu ─────────────────────────────────────────────────────────────

interface CtxMenuProps {
  x: number; y: number
  node: TreeNode
  path: string
  onClose: () => void
  onShowContent?: (path: string) => void
  sourceLayer: LayerRef | null
  targetLayers: Map<string, string>
  clipboard: Clip | null
  onStartInlineCreate: (parentPath: string) => void
  onRemove?: MenuTreeViewProps['onRemovePath']
  onRename?: MenuTreeViewProps['onRenamePath']
  onLock?: MenuTreeViewProps['onLockLayer']
  onUnlock?: MenuTreeViewProps['onUnlockLayer']
  onDestroy?: MenuTreeViewProps['onDestroyLayer']
  onMerge?: MenuTreeViewProps['onMergeLayer']
  onSubtract?: MenuTreeViewProps['onSubtractLayer']
  onCopy: (path: string) => void
  onCut: (path: string) => void
  onPaste: (target: string) => Promise<void>
}

function CtxMenu({
  x, y, node, path, onClose, onShowContent,
  sourceLayer, targetLayers, clipboard,
  onStartInlineCreate, onRemove, onRename,
  onLock, onUnlock, onDestroy, onMerge, onSubtract,
  onCopy, onCut, onPaste,
}: CtxMenuProps) {

  const canMergeSubtract = sourceLayer && targetLayers.size > 0 && sourceLayer.path === path
  const hasLayerSel = sourceLayer && targetLayers.size > 0 && (
    sourceLayer.path === path || targetLayers.has(path)
  )

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
        {/* Show layer content — workspace tree only */}
        {onShowContent && item(<Eye className="w-3 h-3" />, 'Show layer content', async () => {
          onShowContent(path)
        })}

        {onShowContent && <div className="my-1 h-px bg-border" />}

        {/* New folder — inline */}
        <button
          type="button"
          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent rounded-sm text-left"
          onClick={() => { onStartInlineCreate(path); onClose() }}
        >
          <Plus className="w-3 h-3" />
          New folder here
        </button>

        {path !== '/' && !node.locked && onRename && item(<Edit2 className="w-3 h-3" />, 'Rename', async () => {
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

        {/* Remove — disabled for locked layers */}
        {path !== '/' && !node.locked && onRemove && (
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

        {/* Lock / unlock / destroy */}
        {(onLock || onUnlock || onDestroy) && (
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
            {path !== '/' && !node.locked && onDestroy && item(
              <Trash2 className="w-3 h-3" />, 'Destroy layer', async () => {
                if (confirm(`Permanently destroy layer "${node.label || node.name}" and its bitmap?`))
                  await onDestroy(node.id)
              }, true
            )}
          </>
        )}

        {/* Layer: merge / subtract */}
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

// ─── Inline create input ──────────────────────────────────────────────────────

interface InlineCreateProps {
  onConfirm: (name: string) => void
  onCancel: () => void
}

function InlineCreateInput({ onConfirm, onCancel }: InlineCreateProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const commit = () => {
    const val = inputRef.current?.value.trim() ?? ''
    if (val) onConfirm(val)
    else onCancel()
  }

  return (
    <div className="flex items-center gap-1.5 rounded-l-md px-2 py-1.5 bg-card border border-primary/50 shadow-sm text-xs">
      <ChevronRight className="w-3 h-3 opacity-0 shrink-0" />
      <input
        ref={inputRef}
        className="flex-1 bg-transparent outline-none min-w-0 text-xs placeholder:text-muted-foreground"
        placeholder="folder name…"
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={commit}
      />
    </div>
  )
}

// ─── Tree node card ───────────────────────────────────────────────────────────

function buildPath(parent: string, name: string) {
  return parent === '/' ? `/${name}` : `${parent}/${name}`
}

function nodeMatchesSearch(node: TreeNode, parentPath: string, query: string): boolean {
  const path = buildPath(parentPath, node.name)
  if (path.toLowerCase().includes(query) || (node.label || '').toLowerCase().includes(query)) return true
  return node.children?.some(c => nodeMatchesSearch(c, path, query)) ?? false
}

interface CardNodeProps {
  node: TreeNode
  parentPath: string
  depth: number
  selectedPath: string
  pendingPath?: string | null
  contentPath?: string | null
  readOnly: boolean
  sourceLayer: LayerRef | null
  targetLayers: Map<string, string>
  clipboard: Clip | null
  searchQuery: string
  inlineCreateParent: string | null
  onSelect: (path: string) => void
  onShowContent?: (path: string) => void
  onCtrl: (path: string, id: string) => void
  onCtxMenu: (e: React.MouseEvent, path: string, node: TreeNode) => void
  onConfirmCreate: (parentPath: string, name: string) => void
  onCancelCreate: () => void
}

function CardNode({
  node, parentPath, depth, selectedPath, pendingPath, contentPath, readOnly,
  sourceLayer, targetLayers, clipboard, searchQuery,
  inlineCreateParent,
  onSelect, onShowContent, onCtrl, onCtxMenu,
  onConfirmCreate, onCancelCreate,
}: CardNodeProps) {

  const path = buildPath(parentPath, node.name)

  if (searchQuery && !nodeMatchesSearch(node, parentPath, searchQuery)) return null

  const [expanded, setExpanded] = useState(() =>
    selectedPath !== '/' && (selectedPath === path || selectedPath.startsWith(path + '/'))
  )

  // Auto-expand when inline create targets this node
  const shouldExpand = expanded || inlineCreateParent === path || (searchQuery.length > 0)

  const hasChildren = node.children && node.children.length > 0
  const isSelected = selectedPath === path
  const isPending = pendingPath === path
  const isContent = contentPath === path
  const isSource = sourceLayer?.path === path
  const isTarget = targetLayers.has(path)

  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) { onCtrl(path, node.id); return }
    onSelect(path)
  }

  return (
    <div>
      <div
        className={cn(
          'group relative flex items-center gap-1.5 rounded-l-md px-2 py-1.5 cursor-pointer transition-all',
          'shadow-sm hover:shadow text-xs',
          isSource && 'ring-1 ring-blue-500/40 bg-blue-500/10',
          isTarget && !isSource && 'ring-1 ring-amber-500/40 bg-amber-500/10',
          isContent && !isSource && !isTarget && 'bg-yellow-100 dark:bg-yellow-800/40 ring-1 ring-yellow-400/50',
          !isSource && !isTarget && !isContent && isSelected && 'bg-accent shadow',
          !isSource && !isTarget && !isContent && !isSelected && isPending && 'bg-accent/50',
          !isSource && !isTarget && !isContent && !isSelected && !isPending && 'bg-card hover:bg-accent/40',
        )}
        style={{ borderRight: node.color ? `4px solid ${node.color}` : '4px solid transparent' }}
        onClick={handleClick}
        onContextMenu={e => { if (!readOnly) { e.preventDefault(); onCtxMenu(e, path, node) } }}
      >
        <button
          type="button"
          className={cn('shrink-0 text-muted-foreground hover:text-foreground', !hasChildren && inlineCreateParent !== path && 'invisible')}
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        >
          {shouldExpand ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>

        {node.locked && <Lock className="w-2.5 h-2.5 shrink-0 text-amber-500" />}

        <span className="flex-1 truncate font-medium">{node.label || node.name}</span>

        {node.description && (
          <span className="hidden group-hover:inline text-[10px] text-muted-foreground truncate max-w-[60px]">
            {node.description}
          </span>
        )}

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

      {shouldExpand && (hasChildren || inlineCreateParent === path) && (
        <div className="ml-3 mt-0.5 space-y-0.5">
          {inlineCreateParent === path && (
            <InlineCreateInput
              onConfirm={name => onConfirmCreate(path, name)}
              onCancel={onCancelCreate}
            />
          )}
          {node.children?.map(child => (
            <CardNode
              key={child.id || child.name}
              node={child}
              parentPath={path}
              depth={depth + 1}
              selectedPath={selectedPath}
              pendingPath={pendingPath}
              contentPath={contentPath}
              readOnly={readOnly}
              sourceLayer={sourceLayer}
              targetLayers={targetLayers}
              clipboard={clipboard}
              searchQuery={searchQuery}
              inlineCreateParent={inlineCreateParent}
              onSelect={onSelect}
              onShowContent={onShowContent}
              onCtrl={onCtrl}
              onCtxMenu={onCtxMenu}
              onConfirmCreate={onConfirmCreate}
              onCancelCreate={onCancelCreate}
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
  rootLabel, contentPath, onShowContent,
  onInsertPath, onRemovePath, onRenamePath, onMovePath, onCopyPath,
  onLockLayer, onUnlockLayer, onDestroyLayer, onMergeLayer, onSubtractLayer,
  searchQuery = '',
}: MenuTreeViewProps) {

  const [clipboard, setClipboard] = useState<Clip | null>(null)
  const [sourceLayer, setSourceLayer] = useState<LayerRef | null>(null)
  const [targetLayers, setTargetLayers] = useState<Map<string, string>>(new Map())
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string; node: TreeNode } | null>(null)
  const [inlineCreateParent, setInlineCreateParent] = useState<string | null>(null)

  const q = searchQuery.toLowerCase().trim()

  const openCtxMenu = useCallback((e: React.MouseEvent, path: string, node: TreeNode) => {
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 190)
    const y = Math.min(e.clientY, window.innerHeight - 260)
    setCtxMenu({ x, y, path, node })
  }, [])

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

  const handleConfirmCreate = useCallback(async (parentPath: string, name: string) => {
    setInlineCreateParent(null)
    if (!onInsertPath) return
    const full = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`
    try { await onInsertPath(full, true) } catch (err) { alert(err instanceof Error ? err.message : String(err)) }
  }, [onInsertPath])

  const handleCancelCreate = useCallback(() => setInlineCreateParent(null), [])

  if (isLoading) return <div className="px-3 py-3 text-xs text-muted-foreground">Loading tree…</div>
  if (!root) return <div className="px-3 py-3 text-xs text-muted-foreground">No tree available</div>

  const hasSelection = sourceLayer || targetLayers.size > 0

  // Shared props for CardNode
  const cardProps = {
    selectedPath, pendingPath, contentPath, readOnly,
    sourceLayer, targetLayers, clipboard, searchQuery: q,
    inlineCreateParent,
    onSelect, onShowContent, onCtrl: handleCtrl, onCtxMenu: openCtxMenu,
    onConfirmCreate: handleConfirmCreate, onCancelCreate: handleCancelCreate,
  }

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

      {/* Root "/" node — always shown, children indented below */}
      <div
        className={cn(
          'group relative flex items-center gap-1.5 rounded-l-md px-2 py-1.5 cursor-pointer transition-all',
          'shadow-sm hover:shadow text-xs',
          selectedPath === '/' && !contentPath ? 'bg-accent shadow' : 'bg-card hover:bg-accent/40',
        )}
        style={{ borderRight: '4px solid transparent' }}
        onClick={() => onSelect('/')}
        onContextMenu={e => {
          if (!readOnly && onInsertPath) {
            e.preventDefault()
            const x = Math.min(e.clientX, window.innerWidth - 190)
            const y = Math.min(e.clientY, window.innerHeight - 260)
            // use root as a pseudo-node for ctx menu
            const pseudoNode = { id: '', name: '/', label: '/', type: 'root', description: '', color: null, locked: false, children: [] } as unknown as TreeNode
            setCtxMenu({ x, y, path: '/', node: pseudoNode })
          }
        }}
      >
        <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
        <span className="flex-1 font-medium truncate">
          / {rootLabel && <span className="text-muted-foreground font-normal">[{rootLabel}]</span>}
        </span>
        {!readOnly && onInsertPath && (
          <button
            type="button"
            className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted-foreground/10 text-muted-foreground"
            onClick={e => {
              e.stopPropagation()
              const x = Math.min(e.clientX, window.innerWidth - 190)
              const y = Math.min(e.clientY, window.innerHeight - 260)
              const pseudoNode = { id: '', name: '/', label: '/', type: 'root', description: '', color: null, locked: false, children: [] } as unknown as TreeNode
              setCtxMenu({ x, y, path: '/', node: pseudoNode })
            }}
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Children indented under root */}
      <div className="ml-3 space-y-0.5">
        {inlineCreateParent === '/' && (
          <InlineCreateInput
            onConfirm={name => handleConfirmCreate('/', name)}
            onCancel={handleCancelCreate}
          />
        )}
        {root.children?.map(child => (
          <CardNode
            key={child.id || child.name}
            node={child}
            parentPath="/"
            depth={0}
            {...cardProps}
          />
        ))}
        {(!root.children?.length && inlineCreateParent !== '/') && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Empty tree</div>
        )}
      </div>

      {ctxMenu && (
        <CtxMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          node={ctxMenu.node}
          path={ctxMenu.path}
          onClose={() => setCtxMenu(null)}
          onShowContent={onShowContent}
          sourceLayer={sourceLayer}
          targetLayers={targetLayers}
          clipboard={clipboard}
          onStartInlineCreate={path => setInlineCreateParent(path)}
          onRemove={!readOnly ? onRemovePath : undefined}
          onRename={!readOnly ? onRenamePath : undefined}
          onLock={!readOnly ? onLockLayer : undefined}
          onUnlock={!readOnly ? onUnlockLayer : undefined}
          onDestroy={!readOnly ? onDestroyLayer : undefined}
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
