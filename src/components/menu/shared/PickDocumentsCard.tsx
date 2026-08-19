import { useEffect, useState } from 'react'
import { X, FileSearch, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { cn } from '@/lib/utils'
import { listWorkspaces, DEFAULT_WORKSPACE_TREE_NAME } from '@/services/workspace'
import { DocumentPathBrowser, WorkspaceListStep } from './tree-picker-shared'
import { type TreeTab, TAB_ICONS, TAB_LABELS } from './tree-picker-utils'
// Workspace is a global type declared in src/types/api.d.ts

export interface PickDocumentsContext {
  workspaceName: string
  treeName: string
  treeType: TreeTab
}

interface PickDocumentsCardProps {
  onClose: () => void
  onConfirm: (documentIds: number[], ctx: PickDocumentsContext) => void | Promise<void>
  // Skips the workspace-picker step entirely — the caller (document-list.tsx)
  // already knows its own workspace.
  fixedWorkspaceName?: string
  saving?: boolean
  sizeClassName?: string
}

// The inverse of LinkToCard: instead of picking destination PATHS for docs you
// already have, this browses to a path and lets you pick existing DOCUMENTS
// there to pull into the caller's current folder. Reuses LinkToCard's
// workspace-list step and tree-render step (tree-picker-shared.tsx) — the tree
// here navigates (single path at a time) rather than multi-selects paths.
export function PickDocumentsCard({ onClose, onConfirm, fixedWorkspaceName, saving = false, sizeClassName }: PickDocumentsCardProps) {
  const [step, setStep] = useState<'workspace' | 'browse'>(fixedWorkspaceName ? 'browse' : 'workspace')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  // Starts true whenever the workspace list will be fetched (no fixed
  // workspace) — the fetch effect below only ever clears it.
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(!fixedWorkspaceName)
  const [workspaceName, setWorkspaceName] = useState<string | null>(fixedWorkspaceName ?? null)
  const [activeTab, setActiveTab] = useState<TreeTab>('context')
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set())

  // Show the list spinner again if the card ever switches from a fixed
  // workspace to the picker step (prop change) — happens during render so the
  // effect below never needs a synchronous setState.
  const [prevFixedWorkspaceName, setPrevFixedWorkspaceName] = useState(fixedWorkspaceName)
  if (fixedWorkspaceName !== prevFixedWorkspaceName) {
    setPrevFixedWorkspaceName(fixedWorkspaceName)
    if (!fixedWorkspaceName) setLoadingWorkspaces(true)
  }

  useEffect(() => {
    if (fixedWorkspaceName) return
    listWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([])).finally(() => setLoadingWorkspaces(false))
  }, [fixedWorkspaceName])

  const pickWorkspace = (name: string) => {
    setWorkspaceName(name)
    setSelectedDocIds(new Set())
    setStep('browse')
  }

  const toggleDoc = (id: number) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const confirm = async () => {
    if (!workspaceName || selectedDocIds.size === 0 || saving) return
    await onConfirm(Array.from(selectedDocIds), {
      workspaceName,
      treeName: activeTab === 'directory' ? 'directory' : DEFAULT_WORKSPACE_TREE_NAME,
      treeType: activeTab,
    })
  }

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-2xl border bg-card shadow-elevation-4', sizeClassName || 'h-viewport-card max-h-full w-[min(420px,90vw)] max-md:h-full max-md:w-full max-md:shadow-elevation-5')}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <FileSearch className="h-4 w-4" />
          {step === 'workspace' ? 'Add existing documents…' : 'Pick documents…'}
        </span>
        <button type="button" onClick={onClose} disabled={saving} className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <div
          className="grid h-full w-[200%] grid-cols-2 transition-transform duration-200"
          style={{ transform: step === 'workspace' ? 'translateX(0)' : 'translateX(-50%)' }}
        >
          {/* Step 1: workspace list */}
          <div className="flex min-w-0 flex-col overflow-y-auto p-2">
            <WorkspaceListStep workspaces={workspaces} loading={loadingWorkspaces} onPick={pickWorkspace} />
          </div>

          {/* Step 2: tree (navigate) + documents at the selected path */}
          <div className="flex min-w-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-1 border-b px-2 pt-2">
              {!fixedWorkspaceName && (
                <button type="button" onClick={() => setStep('workspace')} className="mr-1 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground touch-target" aria-label="Back to workspaces">
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </button>
              )}
              {(['context', 'directory'] as TreeTab[]).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setActiveTab(tab); setSelectedDocIds(new Set()) }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-xs font-medium transition-colors',
                    activeTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {TAB_ICONS[tab]}
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            {workspaceName && (
              <DocumentPathBrowser
                workspaceName={workspaceName}
                treeTab={activeTab}
                selectedDocIds={selectedDocIds}
                onToggleDoc={toggleDoc}
                onNavigate={() => setSelectedDocIds(new Set())}
              />
            )}
          </div>
        </div>
      </div>

      {step === 'browse' && (
        <div className="flex shrink-0 items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {selectedDocIds.size} document{selectedDocIds.size !== 1 ? 's' : ''} selected
          </span>
          <Button size="sm" onClick={confirm} disabled={selectedDocIds.size === 0 || saving}>
            {saving ? (<><Loader className="mr-1.5 h-3.5 w-3.5" />Adding…</>) : (<><FileSearch className="mr-1 h-3.5 w-3.5" />Add</>)}
          </Button>
        </div>
      )}
    </div>
  )
}
