import { useEffect, useState } from 'react'
import { X, Search, Link2, ChevronRight, ChevronDown, FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { cn } from '@/lib/utils'
import { ContextMenuShell } from '@/components/common/context-menu-shell'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import {
  listWorkspaces,
  getCachedWorkspaceTreeByName,
  invalidateWorkspaceTreeCache,
  insertWorkspacePath,
  DEFAULT_WORKSPACE_TREE_NAME,
  RELATION_PREDICATES,
} from '@/services/workspace'
import type { TreeNode } from '@/types/workspace'
import { LinkNode, WorkspaceListStep, InlineCreateRow, DocumentPathBrowser } from './tree-picker-shared'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { type TreeTab, type PickerTab, type RowMenuEvent, TAB_ICONS, TAB_LABELS, useRowMenu } from './tree-picker-utils'
// Workspace is a global type declared in src/types/api.d.ts

export interface LinkToTarget {
  workspaceName: string
  treeName: string
  treeType: 'context' | 'directory'
}

// Direction is an AXIS, never a predicate name (synapsd indexes/edges/
// predicates.js): 'out' = the source documents point AT the picked ones,
// 'in' = the picked ones point at the sources.
export type RelationDirection = 'in' | 'out'

export interface LinkToRelation {
  predicate: string
  direction: RelationDirection
  targetIds: number[]
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
  // Tabs offered. Default keeps the original tree pair; pass
  // ['context', 'directory', 'backends'] to also browse the read-only
  // connector/storage mirror (folder creation is disabled there), or include
  // 'relations' to offer document-to-document edges alongside the paths.
  tabs?: PickerTab[]
  // Required for the 'relations' tab. Called with the picked predicate, axis
  // and target document ids instead of onConfirm's paths.
  onConfirmRelation?: (relation: LinkToRelation, ctx: { workspaceName: string }) => void | Promise<void>
  // Workspace the relation edges are written to. Relations are intra-workspace
  // by construction (one edge plane per index), so this pins them to the source
  // document's workspace even while the path tabs browse another one. Defaults
  // to whatever workspace the card has selected.
  relationWorkspaceName?: string
  // Live predicate registry from the server (a relations read echoes it); the
  // bundled constant is the fallback.
  relationPredicates?: string[]
  // Documents the relation tab must not offer — at minimum the subjects
  // themselves, since a document cannot be related to itself.
  relationExcludeIds?: ReadonlySet<number>
  // Header title + confirm button label overrides — for "pick a path" usages
  // (rule builder) where "Link N documents" would mislead.
  title?: string
  confirmLabel?: string
}

// Merges the old TreePicker (workspace choice) and LinkToPanel (nice
// multi-select tree UI) into one reusable card: pick a workspace from a
// WorkspaceList-styled row list, slide into the tree-with-tabs view. Renders
// as a plain card — callers own positioning (inline sibling for B5Card,
// fixed overlay for document-list's existing usage).
export function LinkToCard({ onClose, onConfirm, documentCount, fixedWorkspaceName, multiple = true, saving = false, sizeClassName, tabs = ['context', 'directory'], title, confirmLabel, onConfirmRelation, relationWorkspaceName, relationPredicates, relationExcludeIds }: LinkToCardProps) {
  const [step, setStep] = useState<'workspace' | 'tree'>(fixedWorkspaceName ? 'tree' : 'workspace')
  // Esc closes the card (all callers render it as an overlay); disabled while
  // a link is saving so it can't vanish mid-write.
  useEscapeClose(onClose, !saving)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  // Starts true whenever the workspace list will be fetched (no fixed
  // workspace) — the fetch effect below only ever clears it.
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(!fixedWorkspaceName)
  const [workspaceName, setWorkspaceName] = useState<string | null>(fixedWorkspaceName ?? null)
  const [activeTab, setActiveTab] = useState<PickerTab>(tabs[0] ?? 'context')
  // Relations tab state — the destination is a document + a typed predicate
  // rather than a path, so it keeps its own selection.
  const predicates = relationPredicates?.length ? relationPredicates : [...RELATION_PREDICATES]
  const [predicate, setPredicate] = useState<string>(predicates[0] ?? 'references')
  const [direction, setDirection] = useState<RelationDirection>('out')
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set())
  const isRelations = activeTab === 'relations'
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [loadingTree, setLoadingTree] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  // Inline "new folder" — long-press (touch) or right-click a tree row for a
  // context menu; picking New folder opens an inline name input under that
  // row. Creates the path, refreshes the tree and selects the new folder so
  // Link can be confirmed immediately.
  const { showErrorToast } = useToastHelpers()
  const [rowMenu, setRowMenu] = useState<RowMenuEvent | null>(null)
  const [createParent, setCreateParent] = useState<string | null>(null)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const rootRowMenu = useRowMenu('/', (e) => setRowMenu(e))

  // The backends tree is a locked mirror — no user-created folders there.
  const canCreateFolders = activeTab !== 'backends' && activeTab !== 'relations'

  const createFolder = async (parent: string, rawName: string) => {
    const name = rawName.trim().replace(/^\/+|\/+$/g, '')
    if (!name || !workspaceName || creatingFolder || !canCreateFolders) return
    setCreatingFolder(true)
    try {
      const path = `${parent === '/' ? '' : parent}/${name}`
      const treeName = activeTab === 'directory' ? 'directory' : DEFAULT_WORKSPACE_TREE_NAME
      await insertWorkspacePath(workspaceName, path, true, treeName)
      invalidateWorkspaceTreeCache(workspaceName)
      const res = await getCachedWorkspaceTreeByName(workspaceName, activeTab as TreeTab)
      setTree(res)
      setSelected(prev => (multiple ? new Set([...prev, path]) : new Set([path])))
      setCreateParent(null)
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to create folder')
    } finally {
      setCreatingFolder(false)
    }
  }

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

  useEffect(() => {
    // The relations tab picks documents, not paths — DocumentPathBrowser loads
    // its own tree there, so this one stays as the user left it.
    if (!workspaceName || activeTab === 'relations') return
    let cancelled = false

    async function loadTree() {
      setLoadingTree(true)
      try {
        const res = await getCachedWorkspaceTreeByName(workspaceName as string, activeTab as TreeTab)
        if (!cancelled) setTree(res)
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
    setSelectedDocIds(new Set())
    setStep('tree')
  }

  const toggleDoc = (id: number) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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

  const canConfirm = isRelations ? selectedDocIds.size > 0 && !!onConfirmRelation : selected.size > 0

  const confirm = async () => {
    if (!workspaceName || saving || !canConfirm) return
    if (isRelations) {
      await onConfirmRelation?.(
        { predicate, direction, targetIds: Array.from(selectedDocIds) },
        { workspaceName: relationWorkspaceName ?? workspaceName },
      )
      return
    }
    await onConfirm(Array.from(selected), {
      workspaceName,
      treeName: activeTab === 'context' ? DEFAULT_WORKSPACE_TREE_NAME : activeTab,
      treeType: activeTab === 'context' ? 'context' : 'directory',
    })
  }

  const count = documentCount ?? 1

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-2xl border bg-card shadow-elevation-4', sizeClassName || 'h-viewport-card max-h-full w-[min(380px,90vw)] max-md:h-full max-md:w-full max-md:shadow-elevation-5')}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-4 w-4" />
          {title ?? (step === 'workspace'
            ? 'Link to…'
            : isRelations
              ? `Relate ${count} document${count !== 1 ? 's' : ''} to…`
              : `Link ${count} document${count !== 1 ? 's' : ''} to…`)}
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
                <button type="button" onClick={() => setStep('workspace')} className="mr-1 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground touch-target" aria-label="Back to workspaces">
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </button>
              )}
              {tabs.map(tab => (
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

            {/* Path search belongs to the tree tabs only — the relations tab
                carries its own folder filter inside its step 1. */}
            {!isRelations && (
              <div className="shrink-0 border-b p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search paths…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            )}

            {/* Relations: the predicate + axis that the picked documents get
                joined by. Direction is an AXIS in synapsd, so it is a control
                here rather than a second set of predicate names. */}
            {isRelations && (
              <div className="shrink-0 space-y-2 border-b bg-primary/[0.04] px-3 py-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="relation-predicate" className="shrink-0 text-xs text-muted-foreground">Predicate</label>
                  <select
                    id="relation-predicate"
                    value={predicate}
                    onChange={e => setPredicate(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {predicates.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  {([
                    { dir: 'out' as const, label: `This → picked`, hint: `the ${count === 1 ? 'document' : 'documents'} you started from ${predicate} the picked one(s)` },
                    { dir: 'in' as const, label: `Picked → this`, hint: `the picked document(s) ${predicate} the ${count === 1 ? 'one' : 'ones'} you started from` },
                  ]).map(({ dir, label, hint }) => (
                    <button
                      key={dir}
                      type="button"
                      title={hint}
                      onClick={() => setDirection(dir)}
                      className={cn(
                        'flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors',
                        direction === dir ? 'border-primary bg-primary text-primary-foreground' : 'border-input hover:bg-accent',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isRelations && multiple && selected.size > 0 && (
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

            {isRelations && (relationWorkspaceName ?? workspaceName) && (
              <DocumentPathBrowser
                workspaceName={(relationWorkspaceName ?? workspaceName) as string}
                treeTab="context"
                selectedDocIds={selectedDocIds}
                onToggleDoc={toggleDoc}
                excludeDocumentIds={relationExcludeIds}
              />
            )}

            <div className={cn('min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3', isRelations && 'hidden')}>
              {loadingTree ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">Loading…</div>
              ) : (
                <>
                  <div
                    className={cn(
                      'group relative flex min-h-10 items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-all select-none text-sm shadow-elevation-1 hover:shadow',
                      'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:transition-colors',
                      selected.has('/')
                        ? 'bg-primary/[0.08] hover:bg-primary/[0.12] before:bg-primary'
                        : 'bg-card hover:bg-primary/[0.04] before:bg-transparent',
                    )}
                    onClick={rootRowMenu.guardClick(() => toggle('/'))}
                    title="/"
                    {...(canCreateFolders ? rootRowMenu.handlers : {})}
                  >
                    <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium">/</span>
                  </div>
                  <div className="ml-[22px] space-y-1.5">
                    {createParent === '/' && (
                      <InlineCreateRow
                        busy={creatingFolder}
                        onConfirm={(name) => createFolder('/', name)}
                        onCancel={() => setCreateParent(null)}
                      />
                    )}
                    {tree?.children?.length ? (
                      tree.children.map(child => (
                        <LinkNode
                          key={child.id || child.name}
                          node={child}
                          parentPath="/"
                          query={q}
                          selected={selected}
                          onToggle={toggle}
                          onRowMenu={canCreateFolders ? setRowMenu : undefined}
                          createParent={createParent}
                          onCreateConfirm={createFolder}
                          onCreateCancel={() => setCreateParent(null)}
                          creating={creatingFolder}
                        />
                      ))
                    ) : createParent !== '/' ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">Empty tree</p>
                    ) : null}
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
            {isRelations
              ? `${selectedDocIds.size} document${selectedDocIds.size !== 1 ? 's' : ''} selected`
              : `${selected.size} path${selected.size !== 1 ? 's' : ''} selected`}
          </span>
          <Button size="sm" onClick={confirm} disabled={!canConfirm || saving}>
            {saving
              ? (<><Loader className="mr-1.5 h-3.5 w-3.5" />{isRelations ? 'Relating…' : 'Linking…'}</>)
              : (<><Link2 className="mr-1 h-3.5 w-3.5" />{isRelations ? 'Relate' : (confirmLabel ?? 'Link')}</>)}
          </Button>
        </div>
      )}

      {/* Row context menu (right-click / long-press) */}
      {rowMenu && (
        <ContextMenuShell
          x={rowMenu.clientX}
          y={rowMenu.clientY}
          onClose={() => setRowMenu(null)}
          className="min-w-[11rem] rounded-md border bg-popover p-1 shadow-elevation-3"
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent"
            onClick={() => { setCreateParent(rowMenu.path); setRowMenu(null) }}
          >
            <FolderPlus className="h-3 w-3" />
            New folder in {rowMenu.path}
          </button>
        </ContextMenuShell>
      )}
    </div>
  )
}
