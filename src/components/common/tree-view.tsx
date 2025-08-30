import { useState, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, ChevronDown, Folder, FolderOpen, MoreHorizontal, Trash2, Plus, ArrowUp, ArrowDown, Clipboard } from 'lucide-react'
import { TreeNode } from '@/types/workspace'
import { cn } from '@/lib/utils'

interface TreeViewProps {
  tree: TreeNode
  selectedPath: string
  onPathSelect: (path: string) => void
  readOnly?: boolean
  title?: string
  subtitle?: string
  onInsertPath?: (path: string, autoCreateLayers?: boolean) => Promise<boolean>
  onRemovePath?: (path: string, recursive?: boolean) => Promise<boolean>
  onMovePath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onCopyPath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onMergeUp?: (path: string) => Promise<boolean>
  onMergeDown?: (path: string) => Promise<boolean>
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
  pastedDocumentIds?: number[]
}

interface TreeNodeProps {
  node: TreeNode
  level: number
  parentPath: string
  selectedPath: string
  onPathSelect: (path: string) => void
  readOnly: boolean
  onInsertPath?: (path: string, autoCreateLayers?: boolean) => Promise<boolean>
  onRemovePath?: (path: string, recursive?: boolean) => Promise<boolean>
  onMovePath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onCopyPath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onMergeUp?: (path: string) => Promise<boolean>
  onMergeDown?: (path: string) => Promise<boolean>
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
  pastedDocumentIds?: number[]
  onDragStart: (path: string, event: React.DragEvent) => void
  onDragOver: (path: string, event: React.DragEvent) => void
  onDrop: (path: string, event: React.DragEvent) => void
  dragOverPath: string | null
}

interface ContextMenuProps {
  isOpen: boolean
  onClose: () => void
  x: number
  y: number
  path: string
  onInsertPath?: (path: string, autoCreateLayers?: boolean) => Promise<boolean>
  onRemovePath?: (path: string, recursive?: boolean) => Promise<boolean>
  onMergeUp?: (path: string) => Promise<boolean>
  onMergeDown?: (path: string) => Promise<boolean>
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
  pastedDocumentIds?: number[]
}

function ContextMenu({ isOpen, onClose, x, y, path, onInsertPath, onRemovePath, onMergeUp, onMergeDown, onPasteDocuments, pastedDocumentIds }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

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
        case 'merge-up':
          if (onMergeUp) {
            await onMergeUp(path)
          }
          break
        case 'merge-down':
          if (onMergeDown) {
            await onMergeDown(path)
          }
          break
        case 'paste':
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
          Insert Path
        </div>
        {pastedDocumentIds && pastedDocumentIds.length > 0 && (
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => handleAction('paste')}
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
        <div className="my-1 h-px bg-border" />
        <div
          className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => handleAction('merge-up')}
        >
          <ArrowUp className="w-4 h-4 mr-2" />
          Merge Up
        </div>
        <div
          className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => handleAction('merge-down')}
        >
          <ArrowDown className="w-4 h-4 mr-2" />
          Merge Down
        </div>
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
  onInsertPath,
  onRemovePath,
  onMovePath,
  onCopyPath,
  onMergeUp,
  onMergeDown,
  onPasteDocuments,
  pastedDocumentIds,
  onDragStart,
  onDragOver,
  onDrop,
  dragOverPath
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  // Build the current path
  const currentPath = parentPath === '/' ? `/${node.name}` : `${parentPath}/${node.name}`
  const isSelected = selectedPath === currentPath
  const hasChildren = node.children && node.children.length > 0
  const isDragOver = dragOverPath === currentPath

  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded)
    }
  }

  const handleSelect = () => {
    onPathSelect(currentPath)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    if (readOnly) return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-center py-1 px-2 rounded-sm text-sm relative group cursor-pointer hover:bg-accent hover:text-accent-foreground",
          readOnly && "opacity-75",
          isSelected && "bg-accent text-accent-foreground",
          isDragOver && !readOnly && "bg-blue-100 border-2 border-blue-300"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleSelect}
        onContextMenu={handleContextMenu}
        draggable={!readOnly}
        onDragStart={(e) => !readOnly && onDragStart(currentPath, e)}
        onDragOver={(e) => !readOnly && onDragOver(currentPath, e)}
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

        {/* Folder icon */}
        <div className="flex items-center justify-center w-4 h-4 mr-2">
          {hasChildren && isExpanded ? (
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
          <span className="truncate" title={node.description || node.label}>
            {node.label}
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
        onMergeUp={onMergeUp}
        onMergeDown={onMergeDown}
        onPasteDocuments={onPasteDocuments}
        pastedDocumentIds={pastedDocumentIds}
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
              onInsertPath={onInsertPath}
              onRemovePath={onRemovePath}
              onMovePath={onMovePath}
              onCopyPath={onCopyPath}
              onMergeUp={onMergeUp}
              onMergeDown={onMergeDown}
              onPasteDocuments={onPasteDocuments}
              pastedDocumentIds={pastedDocumentIds}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              dragOverPath={dragOverPath}
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
  title = 'Tree',
  subtitle,
  onInsertPath,
  onRemovePath,
  onMovePath,
  onCopyPath,
  onMergeUp,
  onMergeDown,
  onPasteDocuments,
  pastedDocumentIds
}: TreeViewProps) {
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  const [rootContextMenu, setRootContextMenu] = useState<{ x: number; y: number } | null>(null)
  const dragCounterRef = useRef(0)

  const defaultSubtitle = useMemo(() => {
    if (subtitle) return subtitle
    return readOnly ? 'Read-only view (shared context)' : 'Right-click for context menu, drag to move/copy (Ctrl=copy, Shift=recursive)'
  }, [subtitle, readOnly])

  const handleDragStart = useCallback((path: string, event: React.DragEvent) => {
    if (readOnly) return

    setDraggedPath(path)
    event.dataTransfer.setData('text/plain', path)
    event.dataTransfer.effectAllowed = 'move'
  }, [readOnly])

  const handleDragOver = useCallback((path: string, event: React.DragEvent) => {
    if (readOnly || !draggedPath) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    // Determine operation based on modifier keys
    if (event.ctrlKey) {
      event.dataTransfer.dropEffect = 'copy'
    } else if (event.shiftKey) {
      event.dataTransfer.dropEffect = 'move'
    }

    setDragOverPath(path)
    dragCounterRef.current++
  }, [readOnly, draggedPath])

  const handleDrop = useCallback(async (targetPath: string, event: React.DragEvent) => {
    if (readOnly || !draggedPath) return

    event.preventDefault()
    setDragOverPath(null)
    dragCounterRef.current = 0

    const sourcePath = draggedPath
    setDraggedPath(null)

    if (sourcePath === targetPath) return

    try {
      // Determine operation based on modifier keys
      const isCtrlPressed = event.ctrlKey
      const isShiftPressed = event.shiftKey

      if (isCtrlPressed && onCopyPath) {
        // Copy operation
        await onCopyPath(sourcePath, targetPath, false)
      } else if (onMovePath) {
        // Move operation (default)
        await onMovePath(sourcePath, targetPath, isShiftPressed)
      }
    } catch (error) {
      console.error('Error during drop operation:', error)
      alert(`Drop operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [readOnly, draggedPath, onCopyPath, onMovePath])

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setDragOverPath(null)
    }
  }, [])

  const handleRootContextMenu = (e: React.MouseEvent) => {
    if (readOnly) return
    e.preventDefault()
    setRootContextMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <div className="w-full" onDragLeave={handleDragLeave}>
      <div className="border-b pb-2 mb-2">
        <h3 className="font-semibold text-sm text-muted-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{defaultSubtitle}</p>
      </div>

      <div className="space-y-0.5">
        {/* Root node */}
        <div
          className={cn(
            "flex items-center py-1 px-2 rounded-sm text-sm group cursor-pointer hover:bg-accent hover:text-accent-foreground",
            readOnly && "opacity-75",
            selectedPath === '/' && "bg-accent text-accent-foreground",
            dragOverPath === '/' && !readOnly && "bg-blue-100 border-2 border-blue-300"
          )}
          onClick={() => onPathSelect('/')}
          onContextMenu={handleRootContextMenu}
          onDragOver={(e) => !readOnly && handleDragOver('/', e)}
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
          onMergeUp={onMergeUp}
          onMergeDown={onMergeDown}
          onPasteDocuments={onPasteDocuments}
          pastedDocumentIds={pastedDocumentIds}
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
            onInsertPath={onInsertPath}
            onRemovePath={onRemovePath}
            onMovePath={onMovePath}
            onCopyPath={onCopyPath}
            onMergeUp={onMergeUp}
            onMergeDown={onMergeDown}
            onPasteDocuments={onPasteDocuments}
            pastedDocumentIds={pastedDocumentIds}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            dragOverPath={dragOverPath}
          />
        ))}
      </div>
    </div>
  )
}
