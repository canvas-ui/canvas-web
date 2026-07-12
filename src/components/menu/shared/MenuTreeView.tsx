/**
 * MenuTreeView — card-style tree for M2 panels.
 * Supports full tree operations via context-menu: new folder (inline),
 * rename, remove, copy/cut/paste, lock/unlock layer, show layer content,
 * merge/subtract layers. Ctrl/⌘-click to multi-select source + targets.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  ChevronRight, ChevronDown,
  Plus, Trash2, Edit2, Copy, Scissors, Clipboard,
  Layers, LayoutDashboard, MoreHorizontal, Lock, Unlock, Eye, Share2, Palette, RefreshCw,
} from 'lucide-react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import type { TreeNode, LayerMetadata } from '@/types/workspace'
import {
  getLayerStyle, mergeLayerStyle, DEFAULT_FOLDER_ICON, DEFAULT_CANVAS_ICON,
  type LayerStyle,
} from '@/lib/layer-style'
import { LayerIconPicker } from './LayerIconPicker'
import { ContextMenuShell } from '@/components/common/context-menu-shell'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MenuTreeViewProps {
  root: TreeNode | null
  treeName?: string
  // The dedicated backends tree: read-only mirror of backend storage. Gates
  // resync / purge / destroy actions and disables generic tree mutations
  // (except real folder ops on writable file backends).
  isBackendsTree?: boolean
  selectedPath: string
  pendingPath?: string | null
  onSelect: (path: string) => void
  isLoading?: boolean
  readOnly?: boolean
  rootLabel?: string
  contentPath?: string | null
  onShowContent?: (path: string, layerId?: string) => void
  onOpenToSide?: (path: string, treeName: string) => void
  onInsertPath?: (path: string, autoCreateLayers?: boolean) => Promise<boolean>
  onCreateCanvas?: (path: string) => Promise<boolean>
  onRemovePath?: (path: string, recursive?: boolean, purge?: boolean, destroy?: boolean) => Promise<boolean>
  onRenamePath?: (fromPath: string, newName: string) => Promise<boolean>
  onMovePath?: (from: string, to: string, recursive?: boolean, sourceTreeName?: string, targetTreeName?: string) => Promise<boolean>
  onCopyPath?: (from: string, to: string, recursive?: boolean, sourceTreeName?: string, targetTreeName?: string) => Promise<boolean>
  onShareCanvas?: (path: string) => Promise<void>
  onLockLayer?: (layerId: string) => Promise<boolean>
  onResyncBackend?: (backendName: string) => Promise<boolean>
  // Writable file-backend folder ops (real fs dirs under /file/<addr> in the
  // backends tree).
  onCreateBackendFolder?: (parentPath: string, name: string) => Promise<boolean>
  onRenameBackendFolder?: (path: string, newName: string) => Promise<boolean>
  onDeleteBackendFolder?: (path: string) => Promise<boolean>
  onUnlockLayer?: (layerId: string, lockBy?: string) => Promise<boolean>
  onDestroyLayer?: (layerId: string) => Promise<boolean>
  onMergeLayer?: (layerId: string, targetLayers: string[]) => Promise<unknown>
  onSubtractLayer?: (layerId: string, targetLayers: string[]) => Promise<unknown>
  onUpdateNode?: (path: string, updates: { metadata?: LayerMetadata }) => Promise<boolean>
  searchQuery?: string
  pastedDocumentIds?: number[]
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
}

type ClipboardMode = 'copy' | 'cut'
type Clip = { mode: ClipboardMode; path: string; treeName: string }
type LayerRef = { path: string; id: string }

const TREE_BRANCH_GUTTER = 22

// Backends-tree nodes live at /<driver>/<backendName>/…; the backend name
// (e.g. workspace:home) is the second path segment. Returns null for the tree
// root and the driver level, where there is no single backend.
// A writable file backend's tree node (/file/<address>/<sub…>). key '' = the
// backend root (children can be created, but it can't be renamed or deleted).
// Only the `file` driver is mirrored writable. Both helpers only apply inside
// the backends tree (isBackendsTree).
function fileBackendTarget(path: string, isBackendsTree: boolean): { address: string; key: string } | null {
  if (!isBackendsTree) return null
  const parts = String(path || '').split('/').filter(Boolean)
  if (parts[0] !== 'file' || parts.length < 2) return null
  return { address: parts[1], key: parts.slice(2).join('/') }
}

function backendNameForPath(path: string, isBackendsTree: boolean): string | null {
  if (!isBackendsTree) return null
  const parts = String(path || '').split('/').filter(Boolean) // ['file','workspace:home',…]
  return parts.length >= 2 ? parts[1] : null
}

// ─── Context menu ─────────────────────────────────────────────────────────────

interface CtxMenuProps {
  x: number; y: number
  node: TreeNode
  path: string
  isBackendsTree: boolean
  onClose: () => void
  onShowContent?: (path: string, layerId?: string) => void
  onOpenToSide?: (path: string) => void
  sourceLayer: LayerRef | null
  targetLayers: Map<string, string>
  clipboard: Clip | null
  onStartInlineCreate: (parentPath: string, isCanvas?: boolean) => void
  onChangeIcon?: () => void
  hasCreateCanvas?: boolean
  onShareCanvas?: MenuTreeViewProps['onShareCanvas']
  onRemove?: MenuTreeViewProps['onRemovePath']
  onRename?: MenuTreeViewProps['onRenamePath']
  onLock?: MenuTreeViewProps['onLockLayer']
  onUnlock?: MenuTreeViewProps['onUnlockLayer']
  onDestroy?: MenuTreeViewProps['onDestroyLayer']
  onMerge?: MenuTreeViewProps['onMergeLayer']
  onSubtract?: MenuTreeViewProps['onSubtractLayer']
  onResyncBackend?: MenuTreeViewProps['onResyncBackend']
  onRenameBackendFolder?: MenuTreeViewProps['onRenameBackendFolder']
  onDeleteBackendFolder?: MenuTreeViewProps['onDeleteBackendFolder']
  onCopy: (path: string) => void
  onCut: (path: string) => void
  onPaste: (target: string) => Promise<void>
  pastedDocumentIds?: number[]
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
}

function CtxMenu({
  x, y, node, path, isBackendsTree, onClose, onShowContent, onOpenToSide,
  sourceLayer, targetLayers, clipboard,
  onStartInlineCreate, onChangeIcon, hasCreateCanvas, onShareCanvas, onRemove, onRename,
  onLock, onUnlock, onDestroy, onMerge, onSubtract, onResyncBackend,
  onRenameBackendFolder, onDeleteBackendFolder,
  onCopy, onCut, onPaste,
  pastedDocumentIds, onPasteDocuments,
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

  return (
    <ContextMenuShell
      x={x}
      y={y}
      onClose={onClose}
      className="min-w-[11rem] rounded-md border bg-popover p-1 shadow-lg"
    >
        {/* Show layer content — workspace tree only */}
        {onShowContent && item(<Eye className="w-3 h-3" />, 'Show layer content', async () => {
          onShowContent(path, node.id || undefined)
        })}
        {onOpenToSide && item(<Eye className="w-3 h-3" />, 'Open to the side', async () => {
          onOpenToSide(path)
        })}

        {(onShowContent || onOpenToSide) && <div className="my-1 h-px bg-border" />}

        {node.type === 'canvas' && onShareCanvas && item(
          <Share2 className="w-3 h-3" />,
          'Share canvas',
          async () => { await onShareCanvas(path) },
        )}

        {node.type === 'canvas' && onShareCanvas && <div className="my-1 h-px bg-border" />}

        {/* Resync backend — backends tree only, where the node maps to a data
            backend. MVP resyncs the whole backend. */}
        {onResyncBackend && backendNameForPath(path, isBackendsTree) && (
          <>
            {item(<RefreshCw className="w-3 h-3" />, `Resync backend (${backendNameForPath(path, isBackendsTree)})`, async () => {
              await onResyncBackend(path)
            })}
            <div className="my-1 h-px bg-border" />
          </>
        )}

        {/* New folder — inline. Hidden inside the read-only backends tree,
            EXCEPT under a writable file backend (/file/<addr>), where it
            creates a real directory on the backend (server mirrors it). */}
        {(!isBackendsTree || fileBackendTarget(path, isBackendsTree)) && (
          <button
            type="button"
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent rounded-sm text-left"
            onClick={() => { onStartInlineCreate(path, false); onClose() }}
          >
            <Plus className="w-3 h-3" />
            New folder here
          </button>
        )}

        {/* Rename / delete a file-backend folder (real fs dir). Only on
            subfolders — never the backend root node itself. */}
        {onRenameBackendFolder && fileBackendTarget(path, isBackendsTree)?.key && item(
          <Edit2 className="w-3 h-3" />, 'Rename folder', async () => {
            const cur = path.split('/').pop() || ''
            const n = prompt('New folder name:', cur)
            if (!n || n === cur) return
            await onRenameBackendFolder(path, n)
          },
        )}
        {onDeleteBackendFolder && fileBackendTarget(path, isBackendsTree)?.key && item(
          <Trash2 className="w-3 h-3" />, 'Delete folder', async () => {
            if (confirm(`Delete folder "${path.split('/').pop()}" and its contents from the backend?`)) await onDeleteBackendFolder(path)
          }, true,
        )}

        {/* New canvas — inline, workspace trees only; never inside the
            backends tree (server rejects it anyway) */}
        {hasCreateCanvas && !isBackendsTree && (
          <button
            type="button"
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent rounded-sm text-left"
            onClick={() => { onStartInlineCreate(path, true); onClose() }}
          >
            <LayoutDashboard className="w-3 h-3 text-violet-500" />
            New canvas here
          </button>
        )}

        {path !== '/' && onChangeIcon && (
          <button
            type="button"
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent rounded-sm text-left"
            onClick={() => { onChangeIcon(); onClose() }}
          >
            <Palette className="w-3 h-3" />
            Change icon
          </button>
        )}

        {/* Generic rename — not in the backends tree (folder renames on
            writable file backends use "Rename folder" above). */}
        {path !== '/' && !node.locked && onRename && !isBackendsTree && item(<Edit2 className="w-3 h-3" />, 'Rename', async () => {
          const cur = path.split('/').pop() || ''
          const n = prompt('New name:', cur)
          if (!n || n === cur) return
          await onRename(path, n)
        })}

        <div className="my-1 h-px bg-border" />

        {/* Clipboard — Copy out of the backends tree is allowed (cherry-picking
            documents into context/directory trees); Cut and pasting INTO the
            backends tree are not (it mirrors backend storage). */}
        {item(<Copy className="w-3 h-3" />, 'Copy', async () => onCopy(path))}
        {!isBackendsTree && item(<Scissors className="w-3 h-3" />, 'Cut', async () => onCut(path))}
        {clipboard && !isBackendsTree && item(
          <Clipboard className="w-3 h-3" />,
          `Paste (${clipboard.mode})`,
          async () => onPaste(path),
        )}
        {pastedDocumentIds && pastedDocumentIds.length > 0 && onPasteDocuments && item(
          <Clipboard className="w-3 h-3" />,
          `Paste ${pastedDocumentIds.length} document(s)`,
          async () => { await onPasteDocuments(path, pastedDocumentIds) },
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
            {/* Backends tree only: also purge the ingested documents from
                the index. Plain Remove above keeps them (an agent/user may have
                filed the keepers elsewhere; backends re-sync the rest if
                re-enabled). "…and destroy" additionally deletes the mirrored
                resources on the backend itself (rw backends only). */}
            {isBackendsTree && (
              <>
                {item(<Trash2 className="w-3 h-3" />, 'Remove and purge documents', async () => {
                  if (confirm(`Remove "${path}" and all children, and PERMANENTLY purge every document under it from the index?`)) await onRemove(path, true, true)
                }, true)}
                {item(<Trash2 className="w-3 h-3" />, 'Remove, purge and destroy on backend', async () => {
                  if (confirm(`Remove "${path}" and all children, purge every document under it from the index, and PERMANENTLY DELETE the mirrored files/messages on the backend?`)) await onRemove(path, true, true, true)
                }, true)}
              </>
            )}
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
            {node.locked && node.lockedBy && node.lockedBy.length > 0 && (
              <>
                <div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Locked by
                </div>
                {node.lockedBy.map(holder => (
                  <div key={holder} className="flex items-center justify-between gap-2 px-3 py-1 text-xs">
                    <span className="truncate" title={holder}>{holder}</span>
                    {onUnlock && (
                      <button
                        type="button"
                        title={`Remove lock held by ${holder}`}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => run(async () => { await onUnlock(node.id, holder) })}
                      >
                        <Unlock className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
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

    </ContextMenuShell>
  )
}

// ─── Inline create input ──────────────────────────────────────────────────────

interface InlineCreateProps {
  onConfirm: (name: string) => void
  onCancel: () => void
  placeholder?: string
}

function InlineCreateInput({ onConfirm, onCancel, placeholder = 'folder name…' }: InlineCreateProps) {
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
    <div className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 bg-card ring-1 ring-primary/50 shadow-lg text-sm font-medium">
      <ChevronRight className="w-4 h-4 opacity-0 shrink-0" />
      <input
        ref={inputRef}
        className="flex-1 bg-transparent outline-none min-w-0 text-sm font-medium placeholder:font-normal placeholder:text-muted-foreground"
        placeholder={placeholder}
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

function findNodeByPath(root: TreeNode | null, path: string): TreeNode | null {
  if (!root || path === '/') return null
  const segments = path.split('/').filter(Boolean)
  let node: TreeNode | undefined = root
  for (const seg of segments) {
    node = node?.children?.find(c => c.name === seg)
    if (!node) return null
  }
  return node ?? null
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
  isLast: boolean
  selectedPath: string
  pendingPath?: string | null
  contentPath?: string | null
  readOnly: boolean
  sourceLayer: LayerRef | null
  targetLayers: Map<string, string>
  clipboard: Clip | null
  searchQuery: string
  inlineCreateParent: string | null
  inlineCreateIsCanvas: boolean
  onSelect: (path: string) => void
  onShowContent?: (path: string) => void
  onCtrl: (path: string, id: string) => void
  onCtxMenu: (e: React.MouseEvent, path: string, node: TreeNode) => void
  onConfirmCreate: (parentPath: string, name: string) => void
  onCancelCreate: () => void
  onOpenPicker?: (e: React.MouseEvent, path: string, node: TreeNode) => void
  styleOverrides: Map<string, LayerStyle>
  // Drag-and-drop
  dragOverPath: string | null
  isCopyDrag: boolean
  onDragStart: (path: string, e: React.DragEvent) => void
  onDragEnter: (path: string, e: React.DragEvent) => void
  onDragOver: (path: string, e: React.DragEvent) => void
  onDragLeave: (path: string, e: React.DragEvent) => void
  onDragEnd: () => void
  onDrop: (path: string, e: React.DragEvent) => void
}

function CardNode({
  node, parentPath, depth, isLast, selectedPath, pendingPath, contentPath, readOnly,
  sourceLayer, targetLayers, clipboard, searchQuery,
  inlineCreateParent, inlineCreateIsCanvas,
  onSelect, onShowContent, onCtrl, onCtxMenu,
  onConfirmCreate, onCancelCreate, onOpenPicker, styleOverrides,
  dragOverPath, isCopyDrag, onDragStart, onDragEnter, onDragOver, onDragLeave, onDragEnd, onDrop,
}: CardNodeProps) {

  const path = buildPath(parentPath, node.name)
  const style = styleOverrides.get(path) ?? getLayerStyle(node)

  const [expanded, setExpanded] = useState(() =>
    selectedPath !== '/' && (selectedPath === path || selectedPath.startsWith(path + '/'))
  )

  if (searchQuery && !nodeMatchesSearch(node, parentPath, searchQuery)) return null

  // Auto-expand when inline create targets this node
  const shouldExpand = expanded || inlineCreateParent === path || (searchQuery.length > 0)

  const hasChildren = node.children && node.children.length > 0
  const isSelected = selectedPath === path
  const isPending = pendingPath === path

  const isSource = sourceLayer?.path === path
  const isTarget = targetLayers.has(path)
  const isCanvas = node.type === 'canvas'

  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) { onCtrl(path, node.id); return }
    onSelect(path)
  }

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute top-0 w-px bg-border"
        style={{
          left: `-${TREE_BRANCH_GUTTER / 2}px`,
          bottom: isLast ? '50%' : 0,
        }}
      />
      <div
        className="pointer-events-none absolute top-5 h-px bg-border"
        style={{
          left: `-${TREE_BRANCH_GUTTER / 2}px`,
          width: `${TREE_BRANCH_GUTTER / 2}px`,
        }}
      />

      <div
        className={cn(
          'group relative flex min-h-10 items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-all select-none overflow-hidden',
          'shadow-lg hover:shadow-xl text-sm',
          'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:transition-colors',
          isSource && 'ring-1 ring-blue-500/40 bg-blue-500/10 before:bg-blue-500',
          isTarget && !isSource && 'ring-1 ring-amber-500/40 bg-amber-500/10 before:bg-amber-500',
          !isSource && !isTarget && isSelected && !node.locked && 'bg-primary/[0.08] hover:bg-primary/[0.12] before:bg-primary',
          !isSource && !isTarget && isSelected && node.locked && 'bg-amber-500/15 hover:bg-amber-500/20 before:bg-primary',
          !isSource && !isTarget && !isSelected && isPending && 'bg-primary/[0.03] before:bg-transparent',
          !isSource && !isTarget && !isSelected && !isPending && !node.locked && 'bg-card hover:bg-primary/[0.04] before:bg-transparent',
          !isSource && !isTarget && !isSelected && node.locked && 'bg-amber-500/15 hover:bg-amber-500/20 before:bg-amber-500',
          dragOverPath === path && !readOnly && !isCopyDrag && 'ring-2 ring-blue-400 bg-blue-50/50',
          dragOverPath === path && !readOnly && isCopyDrag && 'ring-2 ring-emerald-500 bg-emerald-50/50',
        )}
        style={{ borderRight: style.color ? `4px solid ${style.color}` : '4px solid transparent' }}
        draggable={!readOnly}
        onClick={handleClick}
        onContextMenu={e => { if (!readOnly) { e.preventDefault(); onCtxMenu(e, path, node) } }}
        onDragStart={e => { if (!readOnly) onDragStart(path, e) }}
        onDragEnter={e => { if (!readOnly) onDragEnter(path, e) }}
        onDragOver={e => { if (!readOnly) onDragOver(path, e) }}
        onDragLeave={e => onDragLeave(path, e)}
        onDragEnd={() => onDragEnd()}
        onDrop={e => { if (!readOnly) onDrop(path, e) }}
      >
        <button
          type="button"
          className={cn('shrink-0 text-muted-foreground hover:text-foreground', !hasChildren && inlineCreateParent !== path && 'invisible')}
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        >
          {shouldExpand ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {(() => {
          const iconEl = (
            <Icon
              icon={style.icon || (isCanvas ? DEFAULT_CANVAS_ICON : DEFAULT_FOLDER_ICON)}
              width={16}
              height={16}
              color={style.color || undefined}
              className={cn('shrink-0', !style.color && (isCanvas ? 'text-violet-500' : 'text-muted-foreground'))}
            />
          )
          return onOpenPicker ? (
            <button
              type="button"
              className="shrink-0 rounded p-0.5 -m-0.5 hover:bg-muted-foreground/10"
              title="Change icon"
              onClick={e => { e.stopPropagation(); onOpenPicker(e, path, node) }}
            >
              {iconEl}
            </button>
          ) : iconEl
        })()}

        <span
          className="flex-1 truncate font-medium"
          title={node.description || undefined}
        >
          {node.label || node.name}
        </span>

        {!readOnly && (
          <button
            type="button"
            className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted-foreground/10 text-muted-foreground"
            onClick={e => { e.stopPropagation(); onCtxMenu(e, path, node) }}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        )}
      </div>

      {shouldExpand && (hasChildren || inlineCreateParent === path) && (
        <div className="ml-[22px] mt-2 mb-1 space-y-1.5">
          {inlineCreateParent === path && (
            <InlineCreateInput
              onConfirm={name => onConfirmCreate(path, name)}
              onCancel={onCancelCreate}
              placeholder={inlineCreateIsCanvas ? 'canvas name…' : undefined}
            />
          )}
          {node.children?.map((child, index) => (
            <CardNode
              key={child.id || child.name}
              node={child}
              parentPath={path}
              depth={depth + 1}
              isLast={index === (node.children?.length ?? 0) - 1}
              selectedPath={selectedPath}
              pendingPath={pendingPath}
              contentPath={contentPath}
              readOnly={readOnly}
              sourceLayer={sourceLayer}
              targetLayers={targetLayers}
              clipboard={clipboard}
              searchQuery={searchQuery}
              inlineCreateParent={inlineCreateParent}
              inlineCreateIsCanvas={inlineCreateIsCanvas}
              onSelect={onSelect}
              onShowContent={onShowContent}
              onCtrl={onCtrl}
              onCtxMenu={onCtxMenu}
              onConfirmCreate={onConfirmCreate}
              onCancelCreate={onCancelCreate}
              onOpenPicker={onOpenPicker}
              styleOverrides={styleOverrides}
              dragOverPath={dragOverPath}
              isCopyDrag={isCopyDrag}
              onDragStart={onDragStart}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function MenuTreeView({
  root, treeName = 'context', isBackendsTree = false, selectedPath, pendingPath, onSelect, isLoading = false, readOnly = false,
  rootLabel, contentPath, onShowContent, onOpenToSide,
  onInsertPath, onCreateCanvas, onShareCanvas, onRemovePath, onRenamePath, onMovePath, onCopyPath,
  pastedDocumentIds, onPasteDocuments,
  onLockLayer, onUnlockLayer, onDestroyLayer, onMergeLayer, onSubtractLayer,
  onResyncBackend,
  onCreateBackendFolder, onRenameBackendFolder, onDeleteBackendFolder,
  onUpdateNode,
  searchQuery = '',
}: MenuTreeViewProps) {

  const [clipboard, setClipboard] = useState<Clip | null>(null)
  const [sourceLayer, setSourceLayer] = useState<LayerRef | null>(null)
  const [targetLayers, setTargetLayers] = useState<Map<string, string>>(new Map())
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string; node: TreeNode } | null>(null)
  const [picker, setPicker] = useState<{ x: number; y: number; path: string; node: TreeNode } | null>(null)
  // Live style preview keyed by path; persistence is debounced. Cleared on
  // every tree refetch (root identity change) so server data takes over.
  const [styleOverrides, setStyleOverrides] = useState<Map<string, LayerStyle>>(new Map())
  const [prevRoot, setPrevRoot] = useState(root)
  const persistTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Latest merged style for the open picker session. Survives the
  // styleOverrides reset below — the debounced persist triggers a refetch
  // mid-session, and without this the next pick would merge onto the stale
  // pre-edit style from picker.node, dropping the change just saved.
  const pickerStyleRef = useRef<{ path: string; style: LayerStyle } | null>(null)

  // Drop optimistic style overrides once fresh server data arrives (root
  // identity changes on refetch). Reset-on-prop-change happens during render.
  // Keep the open picker session's style so its preview doesn't flicker back.
  if (root !== prevRoot) {
    setPrevRoot(root)
    const kept = pickerStyleRef.current
    setStyleOverrides(kept ? new Map([[kept.path, kept.style]]) : new Map())
  }
  const [inlineCreateParent, setInlineCreateParent] = useState<string | null>(null)
  const [inlineCreateIsCanvas, setInlineCreateIsCanvas] = useState(false)

  // ── Drag-and-drop state ───────────────────────────────────────────────────
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [isCopyDrag, setIsCopyDrag] = useState(false)
  const [copyModeSticky, setCopyModeSticky] = useState(false)
  const draggedPathRef = useRef<string | null>(null)
  const draggedTreeRef = useRef<string>(treeName)
  const isCopyRef = useRef(false)
  const copyModeStickyRef = useRef(false)

  useEffect(() => {
    const onClipboard = (event: Event) => {
      setClipboard((event as CustomEvent<Clip | null>).detail ?? null)
    }
    window.addEventListener('tree:path-clipboard', onClipboard)
    return () => window.removeEventListener('tree:path-clipboard', onClipboard)
  }, [])

  // Track ctrl/meta/alt globally — Firefox fires keydown/keyup during drag
  // (Chrome does not). Respect sticky toggle as the floor.
  useEffect(() => {
    const sync = (e: KeyboardEvent) => {
      const next = e.ctrlKey || e.altKey || copyModeStickyRef.current
      isCopyRef.current = next
      setIsCopyDrag(next)
    }
    window.addEventListener('keydown', sync)
    window.addEventListener('keyup', sync)
    return () => {
      window.removeEventListener('keydown', sync)
      window.removeEventListener('keyup', sync)
    }
  }, [])

  const isValidPathDrop = useCallback((src: string, tgt: string, isCopy: boolean): boolean => {
    if (draggedTreeRef.current !== treeName) return true
    const ns = src.endsWith('/') ? src.slice(0, -1) : src
    const nt = tgt.endsWith('/') ? tgt.slice(0, -1) : tgt
    const srcParent = ns.substring(0, ns.lastIndexOf('/')) || '/'
    if (nt.startsWith(ns + '/')) return false
    if (ns === nt) return false
    if (!isCopy && nt === srcParent) return false
    return true
  }, [treeName])

  const handleDragStart = useCallback((path: string, e: React.DragEvent) => {
    draggedPathRef.current = path
    draggedTreeRef.current = treeName
    e.dataTransfer.setData('text/plain', path)
    e.dataTransfer.setData('application/x-canvas-tree-path', JSON.stringify({ path, treeName }))
    e.dataTransfer.effectAllowed = 'copyMove'
  }, [treeName])

  const eventIsCopy = (e: React.DragEvent) =>
    e.ctrlKey || e.altKey || copyModeStickyRef.current

  const handleDragEnter = useCallback((path: string, e: React.DragEvent) => {
    const src = draggedPathRef.current
    const isCopy = eventIsCopy(e)
    if (isCopy !== isCopyRef.current) { isCopyRef.current = isCopy; setIsCopyDrag(isCopy) }
    if (src) {
      if (!isValidPathDrop(src, path, isCopy)) return
    }
    e.preventDefault()
    setDragOverPath(path)
  }, [isValidPathDrop])

  const handleDragOver = useCallback((path: string, e: React.DragEvent) => {
    const isCopy = eventIsCopy(e)
    if (isCopy !== isCopyRef.current) {
      isCopyRef.current = isCopy
      setIsCopyDrag(isCopy)
    }
    const src = draggedPathRef.current
    if (src) {
      if (!isValidPathDrop(src, path, isCopy)) {
        e.dataTransfer.dropEffect = 'none'
        return
      }
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = isCopy ? 'copy' : 'move'
  }, [isValidPathDrop])

  const handleDragLeave = useCallback((path: string, e: React.DragEvent) => {
    if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) {
      setDragOverPath(prev => prev === path ? null : prev)
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    draggedPathRef.current = null
    draggedTreeRef.current = treeName
    isCopyRef.current = false
    setIsCopyDrag(false)
    setDragOverPath(null)
  }, [treeName])

  const handleDrop = useCallback(async (targetPath: string, e: React.DragEvent) => {
    e.preventDefault()
    // Documents dragged from the content area carry an application/json
    // payload ({ type: 'document', documentIds }) — link them into the
    // drop path instead of treating the drop as a tree-path move.
    const docPayload = (() => {
      try { return JSON.parse(e.dataTransfer.getData('application/json')) as { type?: string; documentIds?: number[] } }
      catch { return null }
    })()
    if (docPayload?.type === 'document' && Array.isArray(docPayload.documentIds) && docPayload.documentIds.length) {
      draggedPathRef.current = null
      isCopyRef.current = false
      setIsCopyDrag(false)
      setDragOverPath(null)
      if (onPasteDocuments) {
        try { await onPasteDocuments(targetPath, docPayload.documentIds) }
        catch (err) { alert(err instanceof Error ? err.message : String(err)) }
      }
      return
    }
    const payload = (() => {
      try { return JSON.parse(e.dataTransfer.getData('application/x-canvas-tree-path')) as { path?: string; treeName?: string } }
      catch { return null }
    })()
    const src = payload?.path || e.dataTransfer.getData('text/plain')
    const sourceTreeName = payload?.treeName || draggedTreeRef.current || treeName
    const isCopy = eventIsCopy(e) || isCopyRef.current
    draggedPathRef.current = null
    draggedTreeRef.current = treeName
    isCopyRef.current = false
    setIsCopyDrag(false)
    setDragOverPath(null)
    if (!src) return
    const isRecursive = e.shiftKey
    const isCrossTree = sourceTreeName !== treeName
    if (!isCrossTree && src === targetPath) return
    if (!isCrossTree && !isValidPathDrop(src, targetPath, isCopy)) return
    try {
      if (isCopy && onCopyPath) {
        await onCopyPath(src, targetPath, isRecursive, sourceTreeName, treeName)
      } else if (!isCopy && onMovePath) {
        await onMovePath(src, targetPath, isRecursive, sourceTreeName, treeName)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }, [isValidPathDrop, onCopyPath, onMovePath, onPasteDocuments, treeName])

  const q = searchQuery.toLowerCase().trim()

  const openCtxMenu = useCallback((e: React.MouseEvent, path: string, node: TreeNode) => {
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, path, node })
  }, [])

  const openPicker = useCallback((e: React.MouseEvent, path: string, node: TreeNode) => {
    e.stopPropagation()
    pickerStyleRef.current = null
    setPicker({ x: e.clientX, y: e.clientY, path, node })
  }, [])

  const handleStyleChange = useCallback((change: LayerStyle) => {
    if (!picker || !onUpdateNode) return
    const path = picker.path
    const base: LayerStyle = styleOverrides.get(path)
      ?? (pickerStyleRef.current?.path === path ? pickerStyleRef.current.style : getLayerStyle(picker.node))
    const next: LayerStyle = { ...base, ...change }
    pickerStyleRef.current = { path, style: next }
    // Instant local preview for both the tree row and the picker.
    setStyleOverrides(prev => new Map(prev).set(path, next))
    // Debounced persist — the native color input fires rapidly while dragging.
    const metadata = mergeLayerStyle(picker.node.metadata, next)
    const timers = persistTimers.current
    const pending = timers.get(path)
    if (pending) clearTimeout(pending)
    timers.set(path, setTimeout(() => {
      timers.delete(path)
      onUpdateNode(path, { metadata }).catch(err => alert(err instanceof Error ? err.message : String(err)))
    }, 350))
  }, [picker, onUpdateNode, styleOverrides])

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
    // target is the parent to paste under; prevent pasting into self or own descendants
    if (clipboard.treeName === treeName && (target === clipboard.path || target.startsWith(clipboard.path + '/'))) return
    if (clipboard.mode === 'cut') {
      await onMovePath(clipboard.path, target, false, clipboard.treeName, treeName)
      setClipboard(null)
      window.dispatchEvent(new CustomEvent('tree:path-clipboard', { detail: null }))
    } else {
      await onCopyPath(clipboard.path, target, false, clipboard.treeName, treeName)
    }
  }, [clipboard, onMovePath, onCopyPath, treeName])

  useEffect(() => {
    if (readOnly) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      if (event.key !== 'F6') return
      event.preventDefault()
      if (clipboard?.mode === 'cut') {
        handlePaste(selectedPath)
        return
      }
      const next = { mode: 'cut' as const, path: selectedPath, treeName }
      setClipboard(next)
      window.dispatchEvent(new CustomEvent('tree:path-clipboard', { detail: next }))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clipboard, handlePaste, readOnly, selectedPath, treeName])

  const handleConfirmCreate = useCallback(async (parentPath: string, name: string) => {
    const isCanvas = inlineCreateIsCanvas
    setInlineCreateParent(null)
    setInlineCreateIsCanvas(false)
    const full = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`
    try {
      if (isCanvas) {
        if (onCreateCanvas && await onCreateCanvas(full)) onSelect(full)
      } else if (fileBackendTarget(parentPath, isBackendsTree) && onCreateBackendFolder) {
        // Under a writable file backend: create a real fs directory, not a tree layer.
        if (await onCreateBackendFolder(parentPath, name)) onSelect(full)
      } else {
        if (onInsertPath && await onInsertPath(full, true)) onSelect(full)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }, [onInsertPath, onCreateCanvas, onCreateBackendFolder, onSelect, inlineCreateIsCanvas, isBackendsTree])

  const handleCancelCreate = useCallback(() => {
    setInlineCreateParent(null)
    setInlineCreateIsCanvas(false)
  }, [])

  // Delete/Backspace removes the selected layer. Scoped to the tree container
  // (not window) so it never fires while the user is in the document list.
  const handleTreeKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (readOnly || !onRemovePath) return
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    const el = event.target as HTMLElement | null
    if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return
    if (!selectedPath || selectedPath === '/') return
    event.preventDefault()
    const node = findNodeByPath(root, selectedPath)
    if (node?.locked) { alert(`"${selectedPath}" is locked`); return }
    if (confirm(`Remove "${selectedPath}"?`)) {
      onRemovePath(selectedPath, false).catch(err => alert(err instanceof Error ? err.message : String(err)))
    }
  }, [readOnly, onRemovePath, selectedPath, root])

  const toggleCopyMode = useCallback(() => {
    setCopyModeSticky(v => {
      const next = !v
      copyModeStickyRef.current = next
      isCopyRef.current = next
      setIsCopyDrag(next)
      return next
    })
  }, [])

  if (isLoading) return <div className="px-3 py-3 text-xs text-muted-foreground">Loading tree…</div>
  if (!root) return <div className="px-3 py-3 text-xs text-muted-foreground">No tree available</div>

  const hasSelection = sourceLayer || targetLayers.size > 0

  // Shared props for CardNode
  const cardProps = {
    selectedPath, pendingPath, contentPath, readOnly,
    sourceLayer, targetLayers, clipboard, searchQuery: q,
    inlineCreateParent, inlineCreateIsCanvas,
    onSelect, onShowContent, onCtrl: handleCtrl, onCtxMenu: openCtxMenu,
    onConfirmCreate: handleConfirmCreate, onCancelCreate: handleCancelCreate,
    onOpenPicker: onUpdateNode ? openPicker : undefined,
    styleOverrides,
    dragOverPath,
    isCopyDrag,
    onDragStart: handleDragStart,
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDragEnd: handleDragEnd,
    onDrop: handleDrop,
  }

  return (
    <div className="px-3 py-2 space-y-1.5 outline-none" tabIndex={0} onKeyDown={handleTreeKeyDown}>
      {!readOnly && (
        <div className="flex items-center justify-end px-1 pb-0.5 text-[10px]">
          <button
            type="button"
            onClick={toggleCopyMode}
            title="Toggle drag-drop mode (or hold Ctrl / Alt while dragging)"
            className={cn(
              'px-2 py-0.5 rounded-full border transition-colors select-none',
              copyModeSticky
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {copyModeSticky ? 'Drag → Copy' : 'Drag → Move'}
          </button>
        </div>
      )}
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
          'group relative flex min-h-10 items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-all select-none',
          'shadow-lg hover:shadow-xl text-sm',
          selectedPath === '/' && !contentPath ? 'bg-primary/[0.06]' : 'bg-card hover:bg-primary/[0.04]',
          dragOverPath === '/' && !readOnly && !isCopyDrag && 'ring-2 ring-blue-400 bg-blue-50/50',
          dragOverPath === '/' && !readOnly && isCopyDrag && 'ring-2 ring-emerald-500 bg-emerald-50/50',
        )}
        style={{ borderRight: '4px solid transparent' }}
        onClick={() => onSelect('/')}
        onDragEnter={e => { if (!readOnly) handleDragEnter('/', e) }}
        onDragOver={e => { if (!readOnly) handleDragOver('/', e) }}
        onDragLeave={e => handleDragLeave('/', e)}
        onDrop={e => { if (!readOnly) handleDrop('/', e) }}
        onContextMenu={e => {
          if (!readOnly && onInsertPath) {
            e.preventDefault()
            // use root as a pseudo-node for ctx menu
            const pseudoNode = { id: '', name: '/', label: '/', type: 'root', description: '', color: null, locked: false, children: [] } as unknown as TreeNode
            setCtxMenu({ x: e.clientX, y: e.clientY, path: '/', node: pseudoNode })
          }
        }}
      >
        <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 font-medium truncate">
          / {rootLabel && <span className="text-muted-foreground font-normal">[{rootLabel}]</span>}
        </span>
        {!readOnly && onInsertPath && (
          <button
            type="button"
            className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted-foreground/10 text-muted-foreground"
            onClick={e => {
              e.stopPropagation()
              const pseudoNode = { id: '', name: '/', label: '/', type: 'root', description: '', color: null, locked: false, children: [] } as unknown as TreeNode
              setCtxMenu({ x: e.clientX, y: e.clientY, path: '/', node: pseudoNode })
            }}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Children indented under root */}
      <div className="ml-[22px] mt-1.5 space-y-1.5">
        {inlineCreateParent === '/' && (
          <InlineCreateInput
            onConfirm={name => handleConfirmCreate('/', name)}
            onCancel={handleCancelCreate}
            placeholder={inlineCreateIsCanvas ? 'canvas name…' : undefined}
          />
        )}
        {root.children?.map((child, index) => (
          <CardNode
            key={child.id || child.name}
            node={child}
            parentPath="/"
            depth={0}
            isLast={index === (root.children?.length ?? 0) - 1}
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
          isBackendsTree={isBackendsTree}
          onClose={() => setCtxMenu(null)}
          onShowContent={onShowContent}
          onOpenToSide={onOpenToSide ? (path) => onOpenToSide(path, treeName) : undefined}
          sourceLayer={sourceLayer}
          targetLayers={targetLayers}
          clipboard={clipboard}
          onStartInlineCreate={(path, isCanvas = false) => { setInlineCreateParent(path); setInlineCreateIsCanvas(isCanvas) }}
          onChangeIcon={onUpdateNode ? () => openPicker({ clientX: ctxMenu.x, clientY: ctxMenu.y, stopPropagation: () => {} } as React.MouseEvent, ctxMenu.path, ctxMenu.node) : undefined}
          hasCreateCanvas={!!onCreateCanvas}
          onShareCanvas={onShareCanvas}
          onRemove={!readOnly ? onRemovePath : undefined}
          onRename={!readOnly ? onRenamePath : undefined}
          onLock={!readOnly ? onLockLayer : undefined}
          onUnlock={!readOnly ? onUnlockLayer : undefined}
          onDestroy={!readOnly ? onDestroyLayer : undefined}
          onMerge={!readOnly ? onMergeLayer : undefined}
          onSubtract={!readOnly ? onSubtractLayer : undefined}
          onResyncBackend={onResyncBackend}
          onRenameBackendFolder={onRenameBackendFolder}
          onDeleteBackendFolder={onDeleteBackendFolder}
          onCopy={path => {
            const next = { mode: 'copy' as const, path, treeName }
            setClipboard(next)
            window.dispatchEvent(new CustomEvent('tree:path-clipboard', { detail: next }))
          }}
          onCut={path => {
            const next = { mode: 'cut' as const, path, treeName }
            setClipboard(next)
            window.dispatchEvent(new CustomEvent('tree:path-clipboard', { detail: next }))
          }}
          onPaste={handlePaste}
          pastedDocumentIds={pastedDocumentIds}
          onPasteDocuments={onPasteDocuments}
        />
      )}

      {picker && onUpdateNode && (
        <LayerIconPicker
          x={picker.x}
          y={picker.y}
          current={styleOverrides.get(picker.path) ?? getLayerStyle(picker.node)}
          onChange={handleStyleChange}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}
