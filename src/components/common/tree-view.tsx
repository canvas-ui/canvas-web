import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, ChevronDown, Folder, FolderOpen, MoreHorizontal, Trash2, Plus, ArrowUp, ArrowDown, Clipboard, Minus, Copy, Scissors, Edit } from 'lucide-react'
import { TreeNode } from '@/types/workspace'
import { cn } from '@/lib/utils'

interface TreeViewProps {
  tree: TreeNode
  selectedPath: string
  onPathSelect: (path: string) => void
  readOnly?: boolean
  onInsertPath?: (path: string, autoCreateLayers?: boolean) => Promise<boolean>
  onRemovePath?: (path: string, recursive?: boolean) => Promise<boolean>
  onRenamePath?: (fromPath: string, newName: string) => Promise<boolean>
  onMovePath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onCopyPath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onCopyPathToClipboard?: (path: string) => void
  onCutPathToClipboard?: (path: string) => void
  onPastePathFromClipboard?: (path: string) => Promise<boolean>
  onMergeUp?: (path: string) => Promise<boolean>
  onMergeDown?: (path: string) => Promise<boolean>
  onSubtractUp?: (path: string) => Promise<boolean>
  onSubtractDown?: (path: string) => Promise<boolean>
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
  pastedDocumentIds?: number[]
  clipboardPaths?: string[]
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
  onRenamePath?: (fromPath: string, newName: string) => Promise<boolean>
  onMovePath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onCopyPath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onCopyPathToClipboard?: (path: string) => void
  onCutPathToClipboard?: (path: string) => void
  onPastePathFromClipboard?: (path: string) => Promise<boolean>
  onMergeUp?: (path: string) => Promise<boolean>
  onMergeDown?: (path: string) => Promise<boolean>
  onSubtractUp?: (path: string) => Promise<boolean>
  onSubtractDown?: (path: string) => Promise<boolean>
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
  pastedDocumentIds?: number[]
  clipboardPaths?: string[]
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
  onRenamePath?: (fromPath: string, newName: string) => Promise<boolean>
  onCopyPath?: (path: string) => void
  onCutPath?: (path: string) => void
  onPastePath?: (path: string) => Promise<boolean>
  onMergeUp?: (path: string) => Promise<boolean>
  onMergeDown?: (path: string) => Promise<boolean>
  onSubtractUp?: (path: string) => Promise<boolean>
  onSubtractDown?: (path: string) => Promise<boolean>
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
  pastedDocumentIds?: number[]
  clipboardPaths?: string[]
  clipboardDocuments?: number[]
}

function ContextMenu({ isOpen, onClose, x, y, path, onInsertPath, onRemovePath, onRenamePath, onCopyPath, onCutPath, onPastePath, onMergeUp, onMergeDown, onSubtractUp, onSubtractDown, onPasteDocuments, pastedDocumentIds, clipboardPaths }: ContextMenuProps) {
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
        case 'subtract-up':
          if (onSubtractUp) {
            await onSubtractUp(path)
          }
          break
        case 'subtract-down':
          if (onSubtractDown) {
            await onSubtractDown(path)
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
        <div className="my-1 h-px bg-border" />
        <div
          className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => handleAction('subtract-up')}
        >
          <Minus className="w-4 h-4 mr-2" />
          Subtract Up
        </div>
        <div
          className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => handleAction('subtract-down')}
        >
          <Minus className="w-4 h-4 mr-2" />
          Subtract Down
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
  onRenamePath,
  onMovePath,
  onCopyPath,
  onCopyPathToClipboard,
  onCutPathToClipboard,
  onPastePathFromClipboard,
  onMergeUp,
  onMergeDown,
  onSubtractUp,
  onSubtractDown,
  onPasteDocuments,
  pastedDocumentIds,
  clipboardPaths,
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
    e.stopPropagation()
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
        onRenamePath={onRenamePath}
        onCopyPath={onCopyPathToClipboard}
        onCutPath={onCutPathToClipboard}
        onPastePath={onPastePathFromClipboard}
        onMergeUp={onMergeUp}
        onMergeDown={onMergeDown}
        onSubtractUp={onSubtractUp}
        onSubtractDown={onSubtractDown}
        onPasteDocuments={onPasteDocuments}
        pastedDocumentIds={pastedDocumentIds}
        clipboardPaths={clipboardPaths}
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
              onRenamePath={onRenamePath}
              onMovePath={onMovePath}
              onCopyPath={onCopyPath}
              onCopyPathToClipboard={onCopyPathToClipboard}
              onCutPathToClipboard={onCutPathToClipboard}
              onPastePathFromClipboard={onPastePathFromClipboard}
              onMergeUp={onMergeUp}
              onMergeDown={onMergeDown}
              onSubtractUp={onSubtractUp}
              onSubtractDown={onSubtractDown}
              onPasteDocuments={onPasteDocuments}
              pastedDocumentIds={pastedDocumentIds}
              clipboardPaths={clipboardPaths}
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
  onInsertPath,
  onRemovePath,
  onRenamePath,
  onMovePath,
  onCopyPath,
  onCopyPathToClipboard,
  onCutPathToClipboard,
  onPastePathFromClipboard,
  onMergeUp,
  onMergeDown,
  onSubtractUp,
  onSubtractDown,
  onPasteDocuments,
  pastedDocumentIds,
  clipboardPaths
}: TreeViewProps) {
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  const [rootContextMenu, setRootContextMenu] = useState<{ x: number; y: number } | null>(null)
  const dragCounterRef = useRef(0)

  const handleDragStart = useCallback((path: string, event: React.DragEvent) => {
    if (readOnly) return

    setDraggedPath(path)
    event.dataTransfer.setData('text/plain', path)
    event.dataTransfer.effectAllowed = 'move'
  }, [readOnly])

  const handleDragOver = useCallback((path: string, event: React.DragEvent) => {
    if (readOnly) return

    // Always prevent default to allow drop; we'll validate on drop
    event.preventDefault()

    // Check if this is a document drag by looking at the data types
    const hasDocumentData = event.dataTransfer.types.includes('application/json')
    const hasPathData = event.dataTransfer.types.includes('text/plain')

    if (hasDocumentData) {
      // For document drops, default to copy
      event.dataTransfer.dropEffect = 'copy'
    } else if (hasPathData) {
      // For path drops, default to move, allow copy with ctrl
      event.dataTransfer.dropEffect = event.ctrlKey ? 'copy' : 'move'
    } else {
      event.dataTransfer.dropEffect = 'copy'
    }

    setDragOverPath(path)
    dragCounterRef.current++
  }, [readOnly, draggedPath])

  const handleDrop = useCallback(async (targetPath: string, event: React.DragEvent) => {
    if (readOnly) return

    event.preventDefault()
    setDragOverPath(null)
    dragCounterRef.current = 0

    try {
            // Check if it's a document being dragged
      const dragData = event.dataTransfer.getData('application/json')

      if (dragData) {
        const parsedData = JSON.parse(dragData)

        if (parsedData.type === 'document') {
          // Handle document drop
          const documentIds = parsedData.documentIds || [parsedData.documentId]
          if (onPasteDocuments) {
            // For now, always copy documents (could extend to move with shift key)
            await onPasteDocuments(targetPath, documentIds)
          }
          return
        }
      }

      // Handle path drag & drop
      if (!draggedPath) return
      const sourcePath = draggedPath
      setDraggedPath(null)

      if (sourcePath === targetPath) return

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
  }, [readOnly, draggedPath, onCopyPath, onMovePath, onPasteDocuments])

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setDragOverPath(null)
    }
  }, [])

  const handleRootContextMenu = (e: React.MouseEvent) => {
    if (readOnly) return
    e.preventDefault()
    e.stopPropagation()
    setRootContextMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <div className="w-full" onDragLeave={handleDragLeave}>

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
          onRenamePath={onRenamePath}
          onCopyPath={onCopyPathToClipboard}
          onCutPath={onCutPathToClipboard}
          onPastePath={onPastePathFromClipboard}
          onMergeUp={onMergeUp}
          onMergeDown={onMergeDown}
          onSubtractUp={onSubtractUp}
          onSubtractDown={onSubtractDown}
          onPasteDocuments={onPasteDocuments}
          pastedDocumentIds={pastedDocumentIds}
          clipboardPaths={clipboardPaths}
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
            onRenamePath={onRenamePath}
            onMovePath={onMovePath}
            onCopyPath={onCopyPath}
            onCopyPathToClipboard={onCopyPathToClipboard}
            onCutPathToClipboard={onCutPathToClipboard}
            onPastePathFromClipboard={onPastePathFromClipboard}
            onMergeUp={onMergeUp}
            onMergeDown={onMergeDown}
            onSubtractUp={onSubtractUp}
            onSubtractDown={onSubtractDown}
            onPasteDocuments={onPasteDocuments}
            pastedDocumentIds={pastedDocumentIds}
            clipboardPaths={clipboardPaths}
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
