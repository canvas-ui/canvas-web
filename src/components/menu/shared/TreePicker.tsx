import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { MenuTreeView } from './MenuTreeView'
import { listWorkspaces, getCachedWorkspaceTreeByName, DEFAULT_WORKSPACE_TREE_NAME } from '@/services/workspace'
import type { TreeNode } from '@/types/workspace'
// Workspace is a global type declared in src/types/api.d.ts

export interface TreePickerTarget {
  workspaceName: string
  path: string
  treeName: string
  treeType: 'context' | 'directory'
}

interface TreePickerProps {
  onClose: () => void
  onSelect: (target: TreePickerTarget) => void
  // When set, the workspace choice is fixed (e.g. a shared-file blob already
  // landed in a specific workspace) and only the path is pickable.
  lockedWorkspaceName?: string
  // True while the caller's onSave (upload + document create) is in flight —
  // shows a spinner on "Save here" and blocks closing mid-save.
  saving?: boolean
}

// Thin picker built on MenuTreeView's existing readOnly + onSelect(path) +
// searchQuery support — not a copy of the 1044-line file, just a workspace
// selector + search bar wrapped around it. Renders as a plain card (not a
// modal) so callers can place it beside another card, e.g. B5Card opens it
// as a sibling panel rather than an overlapping dialog.
export function TreePicker({ onClose, onSelect, lockedWorkspaceName, saving = false }: TreePickerProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceName, setWorkspaceName] = useState<string | null>(lockedWorkspaceName ?? null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [loadingTree, setLoadingTree] = useState(false)
  const [path, setPath] = useState('/')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (lockedWorkspaceName) return
    listWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]))
  }, [lockedWorkspaceName])

  useEffect(() => {
    if (!workspaceName) return
    let cancelled = false

    async function loadTree() {
      setLoadingTree(true)
      setPath('/')
      try {
        const res = await getCachedWorkspaceTreeByName(workspaceName as string, 'context')
        if (!cancelled) setTree(res.payload)
      } catch {
        if (!cancelled) setTree(null)
      } finally {
        if (!cancelled) setLoadingTree(false)
      }
    }

    loadTree()
    return () => { cancelled = true }
  }, [workspaceName])

  const confirm = () => {
    if (!workspaceName) return
    onSelect({ workspaceName, path, treeName: DEFAULT_WORKSPACE_TREE_NAME, treeType: 'context' })
  }

  return (
    <div className="flex h-[85vh] max-h-[85vh] w-[360px] flex-col overflow-hidden rounded-2xl border bg-card shadow-elevation-4">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="text-sm font-medium">Save to…</span>
        <button type="button" onClick={onClose} disabled={saving} className="text-muted-foreground hover:text-foreground disabled:opacity-40" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!lockedWorkspaceName && (
        <div className="shrink-0 border-b p-2">
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={workspaceName ?? ''}
            onChange={(e) => setWorkspaceName(e.target.value || null)}
            disabled={saving}
          >
            <option value="" disabled>Select a workspace…</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.name}>{w.name}</option>
            ))}
          </select>
        </div>
      )}

      {workspaceName && (
        <>
          <div className="relative shrink-0 border-b p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-8 pl-7 text-sm"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            <MenuTreeView
              root={tree}
              treeName={DEFAULT_WORKSPACE_TREE_NAME}
              selectedPath={path}
              onSelect={setPath}
              isLoading={loadingTree}
              readOnly
              searchQuery={query}
            />
          </div>
        </>
      )}

      <div className="flex shrink-0 items-center justify-between gap-2 border-t p-3">
        <p className="truncate text-xs text-muted-foreground">{workspaceName ? path : 'Choose a workspace'}</p>
        <Button size="sm" onClick={confirm} disabled={!workspaceName || saving}>
          {saving ? (<><Loader className="mr-1.5 h-3.5 w-3.5" />Saving…</>) : 'Save here'}
        </Button>
      </div>
    </div>
  )
}
