import { useEffect, useState } from 'react'
import { X, Search, Link2, ChevronRight, ChevronDown, FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { cn } from '@/lib/utils'
import {
  listWorkspaces,
  getCachedWorkspaceTreeByName,
  invalidateWorkspaceTreeCache,
  insertWorkspacePath,
  DEFAULT_WORKSPACE_TREE_NAME,
} from '@/services/workspace'
import type { TreeNode } from '@/types/workspace'
import { type TreeTab, TAB_ICONS, TAB_LABELS, LinkNode, WorkspaceListStep } from './tree-picker-shared'
// Workspace is a global type declared in src/types/api.d.ts

export interface LinkToTarget {
  workspaceName: string
  treeName: string
  treeType: 'context' | 'directory'
}

interface LinkToCardProps {
  onClose: () => void
  onConfirm: (paths: string[], ctx: LinkToTarget) => void | Promise<void>
  documentCount?: number
  // Skips the workspace-picker step entirely — used by document-list.tsx's
  // existing "Link to…" action, which already knows its workspace.
  fixedWorkspaceName?: string
  // false = clicking a row replaces the selection (single path), no pinned
  // chips. true (default) = multi-select with pinned chips, LinkToPanel's
  // original behavior.
  multiple?: boolean
  saving?: boolean
  // Overrides the default B5-sibling sizing (85vh, 380px wide) — e.g. full
  // height for document-list's right-edge overlay usage.
  sizeClassName?: string
}

// Merges the old TreePicker (workspace choice) and LinkToPanel (nice
// multi-select tree UI) into one reusable card: pick a workspace from a
// WorkspaceList-styled row list, slide into the tree-with-tabs view. Renders
// as a plain card — callers own positioning (inline sibling for B5Card,
// fixed overlay for document-list's existing usage).
export function LinkToCard({ onClose, onConfirm, documentCount, fixedWorkspaceName, multiple = true, saving = false, sizeClassName }: LinkToCardProps) {
  const [step, setStep] = useState<'workspace' | 'tree'>(fixedWorkspaceName ? 'tree' : 'workspace')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false)
  const [workspaceName, setWorkspaceName] = useState<string | null>(fixedWorkspaceName ?? null)
  const [activeTab, setActiveTab] = useState<TreeTab>('context')
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [loadingTree, setLoadingTree] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  // Inline "new folder" — create a destination right here instead of leaving
  // the dialog. Creates under the most recently selected path (or /), then
  // selects the created path so Link can be confirmed immediately.
  const [folderOpen, setFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)

  const folderParent = Array.from(selected).pop() ?? '/'

  const createFolder = async () => {
    const name = folderName.trim().replace(/^\/+|\/+$/g, '')
    if (!name || !workspaceName || creatingFolder) return
    setCreatingFolder(true)
    setFolderError(null)
    try {
      const path = `${folderParent === '/' ? '' : folderParent}/${name}`
      const treeName = activeTab === 'directory' ? 'directory' : DEFAULT_WORKSPACE_TREE_NAME
      await insertWorkspacePath(workspaceName, path, true, treeName)
      invalidateWorkspaceTreeCache(workspaceName)
      const res = await getCachedWorkspaceTreeByName(workspaceName, activeTab)
      setTree(res.payload)
      setSelected(prev => (multiple ? new Set([...prev, path]) : new Set([path])))
      setFolderName('')
      setFolderOpen(false)
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : 'Failed to create folder')
    } finally {
      setCreatingFolder(false)
    }
  }

  useEffect(() => {
    if (fixedWorkspaceName) return
    setLoadingWorkspaces(true)
    listWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([])).finally(() => setLoadingWorkspaces(false))
  }, [fixedWorkspaceName])

  useEffect(() => {
    if (!workspaceName) return
    let cancelled = false

    async function loadTree() {
      setLoadingTree(true)
      try {
        const res = await getCachedWorkspaceTreeByName(workspaceName as string, activeTab)
        if (!cancelled) setTree(res.payload)
      } catch {
        if (!cancelled) setTree(null)
      } finally {
        if (!cancelled) setLoadingTree(false)
      }
    }

    loadTree()
    return () => { cancelled = true }
  }, [workspaceName, activeTab])

  const pickWorkspace = (name: string) => {
    setWorkspaceName(name)
    setSelected(new Set())
    setStep('tree')
  }

  const toggle = (path: string) => {
    if (!multiple) {
      setSelected(new Set([path]))
      return
    }
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const confirm = async () => {
    if (!workspaceName || selected.size === 0 || saving) return
    await onConfirm(Array.from(selected), { workspaceName, treeName: activeTab === 'directory' ? 'directory' : DEFAULT_WORKSPACE_TREE_NAME, treeType: activeTab })
  }

  const count = documentCount ?? 1

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-2xl border bg-card shadow-elevation-4', sizeClassName || 'h-[85dvh] max-h-full w-[min(380px,90vw)] max-md:h-full max-md:w-full max-md:shadow-elevation-8')}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-4 w-4" />
          {step === 'workspace' ? 'Link to…' : `Link ${count} document${count !== 1 ? 's' : ''} to…`}
        </span>
        <button type="button" onClick={onClose} disabled={saving} className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {/* Grid (not flex) for the two steps — grid tracks split the 200%-wide
            carousel exactly in half regardless of content, avoiding the
            flex-basis/content-fighting that let both steps render at once. */}
        <div
          className="grid h-full w-[200%] grid-cols-2 transition-transform duration-200"
          style={{ transform: step === 'workspace' ? 'translateX(0)' : 'translateX(-50%)' }}
        >
          {/* Step 1: workspace list — WorkspaceList.tsx row styling, minus manage controls */}
          <div className="flex min-w-0 flex-col overflow-y-auto p-2">
            <WorkspaceListStep workspaces={workspaces} loading={loadingWorkspaces} onPick={pickWorkspace} />
          </div>

          {/* Step 2: tree, tabbed by type */}
          <div className="flex min-w-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-1 border-b px-2 pt-2">
              {!fixedWorkspaceName && (
                <button type="button" onClick={() => setStep('workspace')} className="mr-1 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to workspaces">
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </button>
              )}
              {(['context', 'directory'] as TreeTab[]).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
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

            <div className="shrink-0 space-y-2 border-b p-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search paths…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setFolderOpen(o => !o); setFolderError(null) }}
                  aria-label="New folder"
                  title="New folder"
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors',
                    folderOpen ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
              </div>
              {folderOpen && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`New folder under ${folderParent}`}
                      value={folderName}
                      onChange={e => setFolderName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') createFolder()
                        if (e.key === 'Escape') setFolderOpen(false)
                      }}
                      autoFocus
                      className="w-full flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <Button size="sm" onClick={createFolder} disabled={!folderName.trim() || creatingFolder}>
                      {creatingFolder ? 'Creating…' : 'Create'}
                    </Button>
                  </div>
                  {folderError && <p className="text-xs text-destructive">{folderError}</p>}
                </div>
              )}
            </div>

            {multiple && selected.size > 0 && (
              <div className="flex shrink-0 flex-wrap gap-1.5 border-b bg-primary/[0.04] px-3 py-2">
                {Array.from(selected).map(path => (
                  <span key={path} className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    <span className="truncate" title={path}>{path}</span>
                    <button type="button" onClick={() => toggle(path)} className="shrink-0 rounded-full hover:bg-primary-foreground/20" aria-label={`Remove ${path}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
              {loadingTree ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">Loading…</div>
              ) : (
                <>
                  <div
                    className={cn(
                      'group relative flex min-h-10 items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-all select-none text-sm shadow-sm hover:shadow',
                      'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:transition-colors',
                      selected.has('/')
                        ? 'bg-primary/[0.08] hover:bg-primary/[0.12] before:bg-primary'
                        : 'bg-card hover:bg-primary/[0.04] before:bg-transparent',
                    )}
                    onClick={() => toggle('/')}
                    title="/"
                  >
                    <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium">/</span>
                  </div>
                  <div className="ml-[22px] space-y-1.5">
                    {tree?.children?.length ? (
                      tree.children.map(child => (
                        <LinkNode key={child.id || child.name} node={child} parentPath="/" query={q} selected={selected} onToggle={toggle} />
                      ))
                    ) : (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">Empty tree</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {step === 'tree' && (
        <div className="flex shrink-0 items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {selected.size} path{selected.size !== 1 ? 's' : ''} selected
          </span>
          <Button size="sm" onClick={confirm} disabled={selected.size === 0 || saving}>
            {saving ? (<><Loader className="mr-1.5 h-3.5 w-3.5" />Linking…</>) : (<><Link2 className="mr-1 h-3.5 w-3.5" />Link</>)}
          </Button>
        </div>
      )}
    </div>
  )
}
