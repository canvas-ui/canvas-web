import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, ChevronDown, Folder, FolderOpen, LayoutDashboard, MoreHorizontal, Trash2, Plus, Clipboard, Copy, Scissors, Edit, Layers } from 'lucide-react'
import { TreeNode } from '@/types/workspace'
import { cn } from '@/lib/utils'

type TreeClipboardMode = 'copy' | 'cut'
type TreeClipboard = { mode: TreeClipboardMode; paths: string[] }

interface TreeViewProps {
  tree: TreeNode
  selectedPath: string
  onPathSelect: (path: string) => void
  readOnly?: boolean
  defaultExpanded?: boolean
  expandedPath?: string
  title?: string
  subtitle?: string
  onInsertPath?: (path: string, autoCreateLayers?: boolean) => Promise<boolean>
  onRemovePath?: (path: string, recursive?: boolean) => Promise<boolean>
  onRenamePath?: (fromPath: string, newName: string) => Promise<boolean>
  onMovePath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onCopyPath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onCopyPathToClipboard?: (path: string) => void
  onCutPathToClipboard?: (path: string) => void
  onPastePathFromClipboard?: (path: string) => Promise<boolean>
  onMergeLayer?: (layerId: string, targetLayers: string[]) => Promise<any>
  onSubtractLayer?: (layerId: string, targetLayers: string[]) => Promise<any>
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
  pastedDocumentIds?: number[]
  clipboardPaths?: string[]
  // Layer selection for merge/subtract
  sourceLayerPath?: string | null
  targetLayerPaths?: Set<string>
  onLayerSelectionChange?: (sourcePath: string | null, targetPaths: Set<string>) => void
}

interface TreeNodeProps {
  node: TreeNode
  level: number
  parentPath: string
  selectedPath: string
  onPathSelect: (path: string) => void
  readOnly: boolean
  defaultExpanded?: boolean
  expandedPath?: string
  onInsertPath?: (path: string, autoCreateLayers?: boolean) => Promise<boolean>
  onRemovePath?: (path: string, recursive?: boolean) => Promise<boolean>
  onRenamePath?: (fromPath: string, newName: string) => Promise<boolean>
  onMovePath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onCopyPath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onCopyPathToClipboard?: (path: string) => void
  onCutPathToClipboard?: (path: string) => void
  onPastePathFromClipboard?: (path: string) => Promise<boolean>
  onMergeLayer?: (layerId: string, targetLayers: string[]) => Promise<any>
  onSubtractLayer?: (layerId: string, targetLayers: string[]) => Promise<any>
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
  pastedDocumentIds?: number[]
  clipboardPaths?: string[]
  onDragStart: (path: string, event: React.DragEvent) => void
  onDragEnter: (path: string, event: React.DragEvent) => void
  onDragOver: (path: string, event: React.DragEvent) => void
  onDragLeave: (path: string, event: React.DragEvent) => void
  onDragEnd: () => void
  onDrop: (path: string, event: React.DragEvent) => void
  dragOverPath: string | null
  tree: TreeNode
  // Layer selection
  sourceLayerPath?: string | null
  targetLayerPaths?: Set<string>
  onLayerSelectionChange?: (sourcePath: string | null, targetPaths: Set<string>) => void
}

interface ContextMenuProps {
  isOpen: boolean
  onClose: () => void
  x: number
  y: number
  path: string
  onInsertPath?: (path: string, autoCreateLayers?: boolean) => Promise<boolean>
  onRemovePath?: (path: string, recursive?: boolean) => Promise<boolean>
  onRenamePath?: (fromPath: string, newName: string) => Promise<boolean>
  onCopyPath?: (path: string) => void
  onCutPath?: (path: string) => void
  onPastePath?: (path: string) => Promise<boolean>
  onMergeLayer?: (layerId: string, targetLayers: string[]) => Promise<any>
  onSubtractLayer?: (layerId: string, targetLayers: string[]) => Promise<any>
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
  pastedDocumentIds?: number[]
  clipboardPaths?: string[]
  clipboardDocuments?: number[]
  tree: TreeNode
  sourceLayerPath?: string | null
  targetLayerPaths?: Set<string>
}

function ContextMenu({ isOpen, onClose, x, y, path, onInsertPath, onRemovePath, onRenamePath, onCopyPath, onCutPath, onPastePath, onMergeLayer, onSubtractLayer, onPasteDocuments, pastedDocumentIds, clipboardPaths, sourceLayerPath, targetLayerPaths }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  const hasValidLayerSelection = sourceLayerPath && targetLayerPaths && targetLayerPaths.size > 0

  const handleAction = async (action: string) => {
    try {
      switch (action) {
        case 'insert':
          const newPath = prompt('Enter new path name:', '')
          if (newPath && onInsertPath) {
            const fullPath = path === '/' ? `/${newPath}` : `${path}/${newPath}`
            await onInsertPath(fullPath, true)
          }
          break
        case 'rename':
          const currentName = path.split('/').pop() || ''
          const newName = prompt('Enter new name:', currentName)
          if (newName && newName !== currentName && onRenamePath) {
            await onRenamePath(path, newName)
          }
          break
        case 'remove':
          if (confirm(`Are you sure you want to remove "${path}"?`)) {
            if (onRemovePath) {
              await onRemovePath(path, false)
            }
          }
          break
        case 'remove-recursive':
          if (confirm(`Are you sure you want to recursively remove "${path}" and all its children?`)) {
            if (onRemovePath) {
              await onRemovePath(path, true)
            }
          }
          break
        case 'merge-layer':
          if (onMergeLayer && sourceLayerPath && targetLayerPaths) {
            const sourceLayerName = sourceLayerPath.split('/').filter(Boolean).pop() || sourceLayerPath
            const targetLayerNames = Array.from(targetLayerPaths).map(p => p.split('/').filter(Boolean).pop() || p)
            await onMergeLayer(sourceLayerName, targetLayerNames)
          }
          break
        case 'subtract-layer':
          if (onSubtractLayer && sourceLayerPath && targetLayerPaths) {
            const sourceLayerName = sourceLayerPath.split('/').filter(Boolean).pop() || sourceLayerPath
            const targetLayerNames = Array.from(targetLayerPaths).map(p => p.split('/').filter(Boolean).pop() || p)
            await onSubtractLayer(sourceLayerName, targetLayerNames)
          }
          break
        case 'copy':
          if (onCopyPath) {
            onCopyPath(path)
          }
          break
        case 'cut':
          if (onCutPath) {
            onCutPath(path)
          }
          break
        case 'paste-paths':
          if (onPastePath) {
            await onPastePath(path)
          }
          break
        case 'paste-documents':
          if (onPasteDocuments && pastedDocumentIds && pastedDocumentIds.length > 0) {
            await onPasteDocuments(path, pastedDocumentIds)
          }
          break
      }
    } catch (error) {
      console.error(`Error performing ${action}:`, error)
      alert(`Failed to ${action}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      onClose()
    }
  }

  if (!isOpen) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        style={{ left: x, top: y }}
      >
        <div
          className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => handleAction('insert')}
        >
          <Plus className="w-4 h-4 mr-2" />
          New Folder
        </div>
        {path !== '/' && (
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => handleAction('rename')}
          >
            <Edit className="w-4 h-4 mr-2" />
            Rename
          </div>
        )}
        <div className="my-1 h-px bg-border" />
        <div
          className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => handleAction('copy')}
        >
          <Copy className="w-4 h-4 mr-2" />
          Copy
        </div>
        <div
          className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => handleAction('cut')}
        >
          <Scissors className="w-4 h-4 mr-2" />
          Cut
        </div>
        {clipboardPaths && clipboardPaths.length > 0 && (
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => handleAction('paste-paths')}
          >
            <Clipboard className="w-4 h-4 mr-2" />
            Paste Folders ({clipboardPaths.length})
          </div>
        )}
        {pastedDocumentIds && pastedDocumentIds.length > 0 && (
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => handleAction('paste-documents')}
          >
            <Clipboard className="w-4 h-4 mr-2" />
            Paste Documents ({pastedDocumentIds.length})
          </div>
        )}
        <div className="my-1 h-px bg-border" />
        <div
          className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => handleAction('remove')}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Remove Path
        </div>
        <div
          className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => handleAction('remove-recursive')}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Remove Path (Recursive)
        </div>
        {hasValidLayerSelection && <div className="my-1 h-px bg-border" />}
        {onMergeLayer && hasValidLayerSelection && (
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => handleAction('merge-layer')}
          >
            <Layers className="w-4 h-4 mr-2" />
            Merge Layer (source: {sourceLayerPath?.split('/').pop()}, targets: {targetLayerPaths?.size})
          </div>
        )}
        {onSubtractLayer && hasValidLayerSelection && (
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => handleAction('subtract-layer')}
          >
            <Layers className="w-4 h-4 mr-2" />
            Subtract Layer (source: {sourceLayerPath?.split('/').pop()}, targets: {targetLayerPaths?.size})
          </div>
        )}
      </div>
    </>, document.body
  )
}

function TreeNodeComponent({
  node,
  level,
  parentPath,
  selectedPath,
  onPathSelect,
  readOnly,
  defaultExpanded = false,
  expandedPath,
  onInsertPath,
  onRemovePath,
  onRenamePath,
  onMovePath,
  onCopyPath,
  onCopyPathToClipboard,
  onCutPathToClipboard,
  onPastePathFromClipboard,
  onMergeLayer,
  onSubtractLayer,
  onPasteDocuments,
  pastedDocumentIds,
  clipboardPaths,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDragEnd,
  onDrop,
  dragOverPath,
  tree,
  sourceLayerPath,
  targetLayerPaths,
  onLayerSelectionChange
}: TreeNodeProps) {
  // Build the current path
  const currentPath = parentPath === '/' ? `/${node.name}` : `${parentPath}/${node.name}`

  // Determine if this node should be automatically expanded due to expandedPath
  const shouldBeAutoExpanded = () => {
    if (expandedPath && expandedPath !== '/') {
      // If we have an expanded path, check if current path is part of that path
      const normalizedExpandedPath = expandedPath.startsWith('/') ? expandedPath : `/${expandedPath}`
      const normalizedCurrentPath = currentPath.startsWith('/') ? currentPath : `/${currentPath}`

      // Node should be expanded if the expanded path starts with this node's path
      return normalizedExpandedPath.startsWith(normalizedCurrentPath) && normalizedExpandedPath !== normalizedCurrentPath
    }
    return defaultExpanded
  }

  // Track manual expansion state separately from automatic expansion
  const [manuallyExpanded, setManuallyExpanded] = useState<boolean | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const isSelected = selectedPath === currentPath
  const hasChildren = node.children && node.children.length > 0
  const isDragOver = dragOverPath === currentPath

  // Layer selection state
  const isSourceLayer = sourceLayerPath === currentPath
  const isTargetLayer = targetLayerPaths?.has(currentPath) || false

  // Determine final expansion state: manual override takes precedence, otherwise use auto-expansion
  const isExpanded = manuallyExpanded !== null ? manuallyExpanded : shouldBeAutoExpanded()

  // Update auto-expansion when expandedPath changes, but don't override manual expansion
  useEffect(() => {
    if (manuallyExpanded === null) {
      // Only update if user hasn't manually interacted with this node
      // The state will update automatically due to shouldBeAutoExpanded() in the computed isExpanded
    }
  }, [expandedPath, manuallyExpanded])

  const handleToggle = () => {
    if (hasChildren) {
      // Mark as manually expanded/collapsed to override automatic behavior
      setManuallyExpanded(!isExpanded)
    }
  }

  const handleSelect = (e: React.MouseEvent) => {
    // Layer selection logic for merge/subtract operations
    if (onLayerSelectionChange && (onMergeLayer || onSubtractLayer)) {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+click: toggle this path as a target (red) if we have a source
        if (sourceLayerPath && currentPath !== sourceLayerPath) {
          const newTargets = new Set(targetLayerPaths || [])
          if (newTargets.has(currentPath)) {
            newTargets.delete(currentPath)
          } else {
            newTargets.add(currentPath)
          }
          onLayerSelectionChange(sourceLayerPath, newTargets)
        }
        return // Don't change selectedPath on Ctrl+click
      } else {
        // Normal click: set as source (blue) and clear targets
        onLayerSelectionChange(currentPath, new Set())
      }
    }

    // Expand the folder if it has children and isn't already expanded
    if (hasChildren && !isExpanded) {
      setManuallyExpanded(true)
    }

    // Normal path selection
    onPathSelect(currentPath)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    if (readOnly) return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-center py-1.5 px-2 rounded-sm text-sm relative group cursor-pointer",
          readOnly && "opacity-75",
          isSourceLayer && "bg-blue-100 hover:bg-blue-200",
          !isSourceLayer && isTargetLayer && "bg-red-100 hover:bg-red-200",
          !isSourceLayer && !isTargetLayer && isSelected && "bg-accent text-accent-foreground",
          !isSourceLayer && !isTargetLayer && !isSelected && "hover:bg-accent hover:text-accent-foreground",
          isDragOver && !readOnly && "border-2 border-blue-300"
        )}
        style={{ paddingLeft: `${level * 16 + 10}px` }}
        onClick={handleSelect}
        onContextMenu={handleContextMenu}
        draggable={!readOnly}
        onDragStart={(e) => !readOnly && onDragStart(currentPath, e)}
        onDragEnter={(e) => !readOnly && onDragEnter(currentPath, e)}
        onDragOver={(e) => !readOnly && onDragOver(currentPath, e)}
        onDragLeave={(e) => onDragLeave(currentPath, e)}
        onDragEnd={() => onDragEnd()}
        onDrop={(e) => !readOnly && onDrop(currentPath, e)}
      >
        {/* Expand/Collapse button */}
        <div className="flex items-center justify-center w-4 h-4 mr-1">
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleToggle()
              }}
              className="hover:bg-muted rounded-sm p-0.5"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : (
            <div className="w-3 h-3" />
          )}
        </div>

        {/* Node icon — canvases get a dashboard glyph in violet, regular layers a folder */}
        <div
          className="flex items-center justify-center w-4 h-4 mr-2"
          title={node.type === 'canvas' ? 'Canvas' : undefined}
        >
          {node.type === 'canvas' ? (
            <LayoutDashboard className="h-3 w-3 text-violet-500" />
          ) : hasChildren && isExpanded ? (
            <FolderOpen className="h-3 w-3 text-blue-500" />
          ) : (
            <Folder className="h-3 w-3 text-blue-500" />
          )}
        </div>

        {/* Node label with color indicator */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {node.color && node.color !== '#fff' && (
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: node.color }}
              title={`Color: ${node.color}`}
            />
          )}
          <span className="truncate" title={node.description || node.label || node.name}>
            {node.label || node.name}
          </span>
        </div>

        {/* Context menu trigger */}
        {!readOnly && (
          <button
            className="opacity-0 group-hover:opacity-100 hover:bg-muted rounded-sm p-1 ml-auto"
            onClick={(e) => {
              e.stopPropagation()
              handleContextMenu(e)
            }}
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Custom context menu */}
      <ContextMenu
        isOpen={!!contextMenu}
        onClose={() => setContextMenu(null)}
        x={contextMenu?.x || 0}
        y={contextMenu?.y || 0}
        path={currentPath}
        onInsertPath={onInsertPath}
        onRemovePath={onRemovePath}
        onRenamePath={onRenamePath}
        onCopyPath={onCopyPathToClipboard}
        onCutPath={onCutPathToClipboard}
        onPastePath={onPastePathFromClipboard}
        onMergeLayer={onMergeLayer}
        onSubtractLayer={onSubtractLayer}
        onPasteDocuments={onPasteDocuments}
        pastedDocumentIds={pastedDocumentIds}
        sourceLayerPath={sourceLayerPath}
        targetLayerPaths={targetLayerPaths}
        clipboardPaths={clipboardPaths}
        tree={tree}
      />

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              level={level + 1}
              parentPath={currentPath}
              selectedPath={selectedPath}
              onPathSelect={onPathSelect}
              readOnly={readOnly}
              defaultExpanded={defaultExpanded}
              expandedPath={expandedPath}
              onInsertPath={onInsertPath}
              onRemovePath={onRemovePath}
              onRenamePath={onRenamePath}
              onMovePath={onMovePath}
              onCopyPath={onCopyPath}
              onCopyPathToClipboard={onCopyPathToClipboard}
              onCutPathToClipboard={onCutPathToClipboard}
              onPastePathFromClipboard={onPastePathFromClipboard}
              onMergeLayer={onMergeLayer}
              onSubtractLayer={onSubtractLayer}
              onPasteDocuments={onPasteDocuments}
              pastedDocumentIds={pastedDocumentIds}
              clipboardPaths={clipboardPaths}
              onDragStart={onDragStart}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
              dragOverPath={dragOverPath}
              tree={tree}
              sourceLayerPath={sourceLayerPath}
              targetLayerPaths={targetLayerPaths}
              onLayerSelectionChange={onLayerSelectionChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function TreeView({
  tree,
  selectedPath,
  onPathSelect,
  readOnly = false,
  defaultExpanded = false,
  expandedPath,
  title: _title,
  subtitle: _subtitle,
  onInsertPath,
  onRemovePath,
  onRenamePath,
  onMovePath,
  onCopyPath,
  onCopyPathToClipboard,
  onCutPathToClipboard,
  onPastePathFromClipboard,
  onMergeLayer,
  onSubtractLayer,
  onPasteDocuments,
  pastedDocumentIds,
  clipboardPaths,
  sourceLayerPath: externalSourceLayerPath,
  targetLayerPaths: externalTargetLayerPaths,
  onLayerSelectionChange: externalOnLayerSelectionChange
}: TreeViewProps) {
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [rootContextMenu, setRootContextMenu] = useState<{ x: number; y: number } | null>(null)
  // Tracks the currently dragged path synchronously so dragenter/dragover handlers
  // validate before React state has a chance to flush after dragstart.
  const draggedPathRef = useRef<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Internal path clipboard (used when no external clipboard is provided)
  const [internalClipboard, setInternalClipboard] = useState<TreeClipboard | null>(null)

  // Internal layer selection state (if not provided externally)
  const [internalSourceLayerPath, setInternalSourceLayerPath] = useState<string | null>(null)
  const [internalTargetLayerPaths, setInternalTargetLayerPaths] = useState<Set<string>>(new Set())

  // Use external state if provided, otherwise use internal state
  const sourceLayerPath = externalSourceLayerPath !== undefined ? externalSourceLayerPath : internalSourceLayerPath
  const targetLayerPaths = externalTargetLayerPaths !== undefined ? externalTargetLayerPaths : internalTargetLayerPaths

  const handleLayerSelectionChange = useCallback((sourcePath: string | null, targetPaths: Set<string>) => {
    if (externalOnLayerSelectionChange) {
      externalOnLayerSelectionChange(sourcePath, targetPaths)
    } else {
      setInternalSourceLayerPath(sourcePath)
      setInternalTargetLayerPaths(targetPaths)
    }
  }, [externalOnLayerSelectionChange])

  const effectiveClipboardPaths = clipboardPaths ?? internalClipboard?.paths ?? []

  const handleCopyPathToClipboardInternal = useCallback((path: string) => {
    if (readOnly) return
    if (!path || path === '/') return
    setInternalClipboard({ mode: 'copy', paths: [path] })
  }, [readOnly])

  const handleCutPathToClipboardInternal = useCallback((path: string) => {
    if (readOnly) return
    if (!path || path === '/') return
    setInternalClipboard({ mode: 'cut', paths: [path] })
  }, [readOnly])

  const handlePastePathFromClipboardInternal = useCallback(async (targetPath: string): Promise<boolean> => {
    if (readOnly) return false
    if (!internalClipboard || internalClipboard.paths.length === 0) return false
    if (!onMovePath && !onCopyPath) return false

    const { mode, paths } = internalClipboard
    let didSomething = false

    for (const fromPath of paths) {
      if (!fromPath) continue
      const baseName = fromPath.split('/').filter(Boolean).pop() ?? fromPath
      const destPath = targetPath === '/' ? `/${baseName}` : `${targetPath}/${baseName}`
      if (fromPath === destPath) continue

      if (mode === 'cut') {
        if (!onMovePath) return false
        await onMovePath(fromPath, destPath, false)
        didSomething = true
      } else {
        if (!onCopyPath) return false
        await onCopyPath(fromPath, destPath, false)
        didSomething = true
      }
    }

    // Don't clear clipboard if paste was effectively a no-op (e.g. cut /a then paste onto /a)
    if (!didSomething) return false

    if (mode === 'cut') {
      setInternalClipboard(null)
    }
    return true
  }, [readOnly, internalClipboard, onMovePath, onCopyPath])

  const effectiveCopyToClipboard = onCopyPathToClipboard ?? handleCopyPathToClipboardInternal
  const effectiveCutToClipboard = onCutPathToClipboard ?? handleCutPathToClipboardInternal
  const effectivePasteFromClipboard = onPastePathFromClipboard ?? handlePastePathFromClipboardInternal

  const handleDragStart = useCallback((path: string, event: React.DragEvent) => {
    if (readOnly) return

    draggedPathRef.current = path
    event.dataTransfer.setData('text/plain', path)
    // Allow Ctrl-drag to copy, Shift-drag to move recursively; default is plain move.
    event.dataTransfer.effectAllowed = 'copyMove'
  }, [readOnly])

  // Returns true when a path drag would be a valid operation given current modifier keys.
  const isValidPathDrop = useCallback((sourcePath: string, targetPath: string, isCopy: boolean): boolean => {
    const normSource = sourcePath.endsWith('/') ? sourcePath.slice(0, -1) : sourcePath
    const normTarget = targetPath.endsWith('/') ? targetPath.slice(0, -1) : targetPath
    const sourceParent = normSource.substring(0, normSource.lastIndexOf('/')) || '/'

    if (normTarget.startsWith(normSource + '/')) return false // target inside source
    if (normSource === normTarget) return false               // same node
    if (!isCopy && normTarget === sourceParent) return false  // move to own parent is no-op
    return true
  }, [])

  // onDragEnter: fires once when cursor enters a node — set the drop target highlight.
  const handleDragEnter = useCallback((path: string, event: React.DragEvent) => {
    if (readOnly) return

    const hasPathData = event.dataTransfer.types.includes('text/plain')
    const currentDragged = draggedPathRef.current

    if (hasPathData && currentDragged) {
      const isCopy = event.ctrlKey || event.metaKey
      if (!isValidPathDrop(currentDragged, path, isCopy)) return
    }

    event.preventDefault()
    setDragOverPath(path)
  }, [readOnly, isValidPathDrop])

  // onDragOver: fires continuously while cursor is over a node — keep drop allowed and
  // update the cursor glyph based on current modifier keys (user can press Ctrl mid-drag).
  const handleDragOver = useCallback((path: string, event: React.DragEvent) => {
    if (readOnly) return

    const hasDocumentData = event.dataTransfer.types.includes('application/json')
    const hasPathData = event.dataTransfer.types.includes('text/plain')
    const currentDragged = draggedPathRef.current

    if (hasPathData && currentDragged) {
      const isCopy = event.ctrlKey || event.metaKey
      if (!isValidPathDrop(currentDragged, path, isCopy)) {
        event.dataTransfer.dropEffect = 'none'
        return
      }
    }

    event.preventDefault()

    if (hasDocumentData) {
      event.dataTransfer.dropEffect = 'copy'
    } else if (hasPathData) {
      // Ctrl = copy, Shift = recursive move, plain = move
      event.dataTransfer.dropEffect = (event.ctrlKey || event.metaKey) ? 'copy' : 'move'
    } else {
      event.dataTransfer.dropEffect = 'copy'
    }
  }, [readOnly, isValidPathDrop])

  // onDragLeave: fires when cursor leaves a node — clear highlight only if truly leaving
  // (not just moving to a child element inside the same row).
  const handleDragLeave = useCallback((path: string, event: React.DragEvent) => {
    const relatedTarget = event.relatedTarget as Node | null
    if (!event.currentTarget.contains(relatedTarget)) {
      setDragOverPath(prev => prev === path ? null : prev)
    }
  }, [])

  // onDragEnd: fires on the drag source after drop or cancel — always clean up.
  const handleDragEnd = useCallback(() => {
    draggedPathRef.current = null
    setDragOverPath(null)
  }, [])

  const handleDrop = useCallback(async (targetPath: string, event: React.DragEvent) => {
    if (readOnly) return

    event.preventDefault()
    draggedPathRef.current = null
    setDragOverPath(null)

    try {
      const dragData = event.dataTransfer.getData('application/json')

      if (dragData) {
        const parsedData = JSON.parse(dragData)

        if (parsedData.type === 'document') {
          const documentIds = parsedData.documentIds || [parsedData.documentId]
          if (onPasteDocuments) {
            // Shift+drop moves documents; plain drop copies.
            await onPasteDocuments(targetPath, documentIds)
          }
          return
        }
      }

      const sourcePath = event.dataTransfer.getData('text/plain')
      if (!sourcePath) return
      if (sourcePath === targetPath) return

      const isCopy = event.ctrlKey || event.metaKey
      const isRecursive = event.shiftKey

      if (!isValidPathDrop(sourcePath, targetPath, isCopy)) return

      if (isCopy && onCopyPath) {
        await onCopyPath(sourcePath, targetPath, isRecursive)
      } else if (!isCopy && onMovePath) {
        await onMovePath(sourcePath, targetPath, isRecursive)
      }
    } catch (error) {
      console.error('Error during drop operation:', error)
      alert(`Drop operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [readOnly, isValidPathDrop, onCopyPath, onMovePath, onPasteDocuments])

  const handleRootContextMenu = (e: React.MouseEvent) => {
    if (readOnly) return
    e.preventDefault()
    e.stopPropagation()
    setRootContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (readOnly) return

    const isMod = e.ctrlKey || e.metaKey
    if (!isMod) return

    const key = e.key.toLowerCase()
    if (key === 'c') {
      e.preventDefault()
      effectiveCopyToClipboard(selectedPath)
    } else if (key === 'x') {
      e.preventDefault()
      effectiveCutToClipboard(selectedPath)
    } else if (key === 'v') {
      e.preventDefault()
      void effectivePasteFromClipboard(selectedPath)
    }
  }

  return (
    <div
      ref={rootRef}
      className="w-full outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseDown={() => rootRef.current?.focus()}
      onDragLeave={(e) => {
        // Clear highlight when drag exits the entire tree widget.
        if (!rootRef.current?.contains(e.relatedTarget as Node)) {
          setDragOverPath(null)
        }
      }}
    >

      <div className="space-y-0.5">
        {/* Root node */}
        <div
          className={cn(
            "flex items-center py-1.5 px-2 rounded-sm text-sm group cursor-pointer hover:bg-accent hover:text-accent-foreground",
            readOnly && "opacity-75",
            selectedPath === '/' && "bg-accent text-accent-foreground",
            dragOverPath === '/' && !readOnly && "bg-blue-100 border-2 border-blue-300"
          )}
          onClick={() => onPathSelect('/')}
          onContextMenu={handleRootContextMenu}
          onDragEnter={(e) => !readOnly && handleDragEnter('/', e)}
          onDragOver={(e) => !readOnly && handleDragOver('/', e)}
          onDragLeave={(e) => handleDragLeave('/', e)}
          onDrop={(e) => !readOnly && handleDrop('/', e)}
        >
          <div className="flex items-center justify-center w-4 h-4 mr-1">
            <div className="w-3 h-3" />
          </div>
          <div className="flex items-center justify-center w-4 h-4 mr-2">
            <FolderOpen className="h-3 w-3 text-blue-600" />
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {tree.color && tree.color !== '#fff' && (
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: tree.color }}
                title={`Color: ${tree.color}`}
              />
            )}
            <span className="truncate font-medium" title={tree.description || "Root directory"}>
              /
            </span>
          </div>

          {/* Context menu trigger */}
          {!readOnly && (
            <button
              className="opacity-0 group-hover:opacity-100 hover:bg-muted rounded-sm p-1 ml-auto"
              onClick={(e) => {
                e.stopPropagation()
                handleRootContextMenu(e)
              }}
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Custom context menu for root */}
        <ContextMenu
          isOpen={!!rootContextMenu}
          onClose={() => setRootContextMenu(null)}
          x={rootContextMenu?.x || 0}
          y={rootContextMenu?.y || 0}
          path="/"
          onInsertPath={onInsertPath}
          onRemovePath={onRemovePath}
          onRenamePath={onRenamePath}
          onCopyPath={effectiveCopyToClipboard}
          onCutPath={effectiveCutToClipboard}
          onPastePath={effectivePasteFromClipboard}
          onMergeLayer={onMergeLayer}
          onSubtractLayer={onSubtractLayer}
          onPasteDocuments={onPasteDocuments}
          pastedDocumentIds={pastedDocumentIds}
          clipboardPaths={effectiveClipboardPaths}
          tree={tree}
          sourceLayerPath={sourceLayerPath}
          targetLayerPaths={targetLayerPaths}
        />

        {/* Child nodes */}
        {tree.children?.map((child) => (
          <TreeNodeComponent
            key={child.id}
            node={child}
            level={1}
            parentPath="/"
            selectedPath={selectedPath}
            onPathSelect={onPathSelect}
            readOnly={readOnly}
            defaultExpanded={defaultExpanded}
            expandedPath={expandedPath}
            onInsertPath={onInsertPath}
            onRemovePath={onRemovePath}
            onRenamePath={onRenamePath}
            onMovePath={onMovePath}
            onCopyPath={onCopyPath}
            onCopyPathToClipboard={effectiveCopyToClipboard}
            onCutPathToClipboard={effectiveCutToClipboard}
            onPastePathFromClipboard={effectivePasteFromClipboard}
            onMergeLayer={onMergeLayer}
            onSubtractLayer={onSubtractLayer}
            onPasteDocuments={onPasteDocuments}
            pastedDocumentIds={pastedDocumentIds}
            clipboardPaths={effectiveClipboardPaths}
            onDragStart={handleDragStart}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            dragOverPath={dragOverPath}
            tree={tree}
            sourceLayerPath={sourceLayerPath}
            targetLayerPaths={targetLayerPaths}
            onLayerSelectionChange={handleLayerSelectionChange}
          />
        ))}
      </div>
    </div>
  )
}
