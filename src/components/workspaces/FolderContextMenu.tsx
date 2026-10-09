import { backendTrashLocation } from '@/lib/backend-trash'
import { restoreBackendTrashPath, discardBackendTrashPath } from '@/services/backend-trash'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clipboard, Copy, Download, Edit2, Eye, FolderOpen, HardDrive, Pin, PinOff, Plus, Trash2, RotateCcw } from 'lucide-react'
import { ContextMenuShell } from '@/components/common/context-menu-shell'
import { useTreeOperations } from '@/hooks/useTreeOperations'
import { backendFolderTarget, listWorkspacePins, pinWorkspacePath, unpinWorkspacePin, type WorkspacePin } from '@/services/workspace'
import { defaultStoreFolder, rulePrefillParams, splitBackendsPath, type RulePrefill } from '@/services/hooks'
import { cn } from '@/lib/utils'

// Right-click menu for the folder tiles/chips/rows in the content area of a
// directory-type tree (directory + backends). The sidebar's tree menu is not
// reusable here — it lives in M2, which is unmounted while the drawer is
// closed — so this is the file-manager subset of it over the same operations
// (useTreeOperations dispatches workspace:tree:refresh, which reloads both the
// page tree and the sidebar).
export function FolderContextMenu({ x, y, workspaceName, treeName, path, onClose, onOpen, onOpenToSide, pastedDocumentIds, onPasteDocuments }: {
  x: number
  y: number
  workspaceName: string
  treeName: string
  path: string
  onClose: () => void
  onOpen: (path: string) => void
  onOpenToSide?: (path: string) => void
  pastedDocumentIds?: number[]
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean | void> | boolean | void
}) {
  const navigate = useNavigate()
  const ops = useTreeOperations({ workspaceId: workspaceName, treeName })
  const isBackends = treeName === 'backends'
  const backendFolder = isBackends ? backendFolderTarget(path) : null
  const name = path.split('/').filter(Boolean).pop() || path

  // Pin state is fetched per open — the page doesn't hold workspace pins.
  const [pin, setPin] = useState<WorkspacePin | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    listWorkspacePins(workspaceName)
      .then(pins => { if (!cancelled) setPin(pins.find(p => p.tree === treeName && p.path === path) ?? null) })
      .catch(() => { if (!cancelled) setPin(null) })
    return () => { cancelled = true }
  }, [workspaceName, treeName, path])

  const run = async (fn: () => Promise<unknown> | unknown) => {
    onClose()
    try { await fn() } catch (err) { alert(err instanceof Error ? err.message : String(err)) }
  }

  const item = (icon: ReactNode, label: string, fn: () => Promise<unknown> | unknown, danger = false) => (
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
  const sep = <div className="my-1 h-px bg-border" />

  const openRuleBuilder = (kind: 'store' | 'download') => {
    const prefill: RulePrefill = isBackends
      ? (() => { const parts = splitBackendsPath(path); return { kind, storeTo: parts?.backend || '', storeFolder: parts?.rel || '' } })()
      : { kind, path: `dir:${path}`, storeFolder: kind === 'download' ? 'Downloads' : defaultStoreFolder(path) }
    navigate(`/workspaces/${workspaceName}/settings/hooks?${rulePrefillParams(prefill).toString()}`)
  }

  const askName = (label: string, current = '') => {
    const n = prompt(label, current)?.trim()
    return n && n !== current && !n.includes('/') ? n : null
  }

  const trash = backendTrashLocation(treeName, path)
  if (trash) return <ContextMenuShell x={x} y={y} onClose={onClose} className="min-w-44 rounded-md border bg-popover p-1 shadow-elevation-3">
    {item(<Trash2 className="h-3 w-3" />, 'Open Trash', () => onOpen(path))}
    {trash.backend && item(<RotateCcw className="h-3 w-3" />, 'Restore original paths', () => restoreBackendTrashPath(workspaceName, path))}
    {trash.backend && item(<Trash2 className="h-3 w-3" />, 'Empty Trash', () => discardBackendTrashPath(workspaceName, path), true)}
  </ContextMenuShell>

  return (
    <ContextMenuShell x={x} y={y} onClose={onClose} className="min-w-[11rem] rounded-md border bg-popover p-1 shadow-elevation-3">
      {item(<FolderOpen className="w-3 h-3" />, 'Open', () => onOpen(path))}
      {onOpenToSide && item(<Eye className="w-3 h-3" />, 'Open to the side', () => onOpenToSide(path))}
      {sep}

      {isBackends ? (
        backendFolder && (
          <>
            {item(<Plus className="w-3 h-3" />, 'New folder here', async () => {
              const n = askName('New folder name:')
              if (n) await ops.onCreateBackendFolder?.(path, n)
            })}
            {backendFolder.key && item(<Edit2 className="w-3 h-3" />, 'Rename folder', async () => {
              const n = askName('New folder name:', name)
              if (n) await ops.onRenameBackendFolder?.(path, n)
            })}
            {item(<HardDrive className="w-3 h-3" />, 'Create storage rule…', () => openRuleBuilder('store'))}
          </>
        )
      ) : (
        <>
          {item(<Plus className="w-3 h-3" />, 'New folder here', async () => {
            const n = askName('New folder name:')
            if (n) await ops.onInsertPath(`${path === '/' ? '' : path}/${n}`)
          })}
          {item(<Edit2 className="w-3 h-3" />, 'Rename', async () => {
            const n = askName('New name:', name)
            if (n) await ops.onRenamePath(path, n)
          })}
          {item(<HardDrive className="w-3 h-3" />, 'Create rule…', () => openRuleBuilder('store'))}
          {item(<Download className="w-3 h-3" />, 'Create download rule…', () => openRuleBuilder('download'))}
        </>
      )}
      {pin !== undefined && item(
        pin ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />,
        pin ? 'Unpin' : 'Pin',
        async () => {
          if (pin) await unpinWorkspacePin(workspaceName, pin.id)
          else await pinWorkspacePath(workspaceName, path, treeName)
          window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName } }))
        },
      )}

      {sep}
      {item(<Copy className="w-3 h-3" />, 'Copy path', () => navigator.clipboard?.writeText(path))}
      {!isBackends && onPasteDocuments && pastedDocumentIds && pastedDocumentIds.length > 0 && item(
        <Clipboard className="w-3 h-3" />,
        `Paste ${pastedDocumentIds.length} document(s)`,
        () => onPasteDocuments(path, pastedDocumentIds),
      )}

      {isBackends ? (
        backendFolder?.key && (
          <>
            {sep}
            {item(<Trash2 className="w-3 h-3" />, 'Delete folder', async () => {
              if (confirm(`Delete folder "${name}" and its contents from the backend?`)) await ops.onDeleteBackendFolder?.(path)
            }, true)}
          </>
        )
      ) : (
        <>
          {sep}
          {item(<Trash2 className="w-3 h-3" />, 'Remove', async () => {
            if (confirm(`Remove "${path}"?`)) await ops.onRemovePath(path, false)
          }, true)}
          {item(<Trash2 className="w-3 h-3" />, 'Remove recursive', async () => {
            if (confirm(`Remove "${path}" and all children?`)) await ops.onRemovePath(path, true)
          }, true)}
        </>
      )}
    </ContextMenuShell>
  )
}
