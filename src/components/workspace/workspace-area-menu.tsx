import { useState, type ReactNode } from 'react'
import { ContextMenuShell } from '@/components/common/context-menu-shell'
import { useTreeOperations } from '@/hooks/useTreeOperations'

/** Shared actions for the current folder, including empty menu and header space. */
export function WorkspaceAreaMenu({ workspaceId, treeName = 'context', path = '/', children, className, headerOnly = false, readOnly = false }: {
  workspaceId: string; treeName?: string; path?: string; children: ReactNode; className?: string; headerOnly?: boolean; readOnly?: boolean
}) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const ops = useTreeOperations({ workspaceId, treeName })
  const actions = [
    ...(!readOnly && ops.onImportDocuments ? [{ label: 'Import documents…', run: () => ops.onImportDocuments!(path) }] : []),
    { label: 'Export documents…', run: () => ops.onExportDocuments!(path) },
  ]
  return <div className={className} onContextMenu={event => {
    if (event.defaultPrevented || (headerOnly && !(event.target as HTMLElement).closest('.canvas-navigation'))) return
    event.preventDefault()
    setAnchor({ x: event.clientX, y: event.clientY })
  }}>
    {children}
    {anchor && <ContextMenuShell {...anchor} onClose={() => setAnchor(null)} className="min-w-44 rounded-md border bg-popover p-1 shadow-elevation-3">
      {actions.map(action => <button key={action.label} type="button" className="block w-full rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent" onClick={() => {
        setAnchor(null)
        void action.run().catch(error => alert(error instanceof Error ? error.message : String(error)))
      }}>{action.label}</button>)}
    </ContextMenuShell>}
  </div>
}
