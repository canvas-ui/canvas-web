import { useEffect, useState, useCallback, useRef } from 'react'
import { Settings, ExternalLink, GitBranch, FolderTree, Layers, LayoutDashboard, Search, Lock, Unlock, Edit2, Trash2, Database } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { buildWorkspaceUrl, parseWorkspacePathFromUrl } from '@/utils/url-params'
import { M2Header } from '@/components/menu/shared/M2Header'
import { DEFAULT_WORKSPACE_ICON } from '@/lib/layer-style'
import { MenuTreeView } from '@/components/menu/shared/MenuTreeView'
import { useMenu } from '@/components/shell/use-menu'
import { useIsMobile } from '@/hooks/use-mobile'
import { getWorkspace, getCachedWorkspaceTreeByName, invalidateWorkspaceTreeCache, listWorkspaceLayers, lockWorkspaceLayer, unlockWorkspaceLayer, renameWorkspaceLayer, destroyWorkspaceLayer, pasteDocumentsToWorkspacePath, createPublicCanvasShare, listBackends, DEFAULT_WORKSPACE_TREE_NAME } from '@/services/workspace'
import type { Layer } from '@/services/workspace'
import { useTreeOperations } from '@/hooks/useTreeOperations'
import { listHooks, runHook, findBackendTreeSyncHook, splitBackendsPath, defaultMirrorTarget } from '@/services/hooks'
import { useToast } from '@/components/ui/use-toast'
import type { TreeNode } from '@/types/workspace'
import socketService from '@/lib/socket'

type TreeTab = 'context' | 'layers' | 'directory' | 'backends'
type TreeDataTab = 'context' | 'directory' | 'backends'

// Display order: Context tree, Context layers, Directory tree, Backends tree.
const TAB_ORDER: TreeTab[] = ['context', 'layers', 'directory', 'backends']

const TAB_ICONS: Record<TreeTab, React.ReactNode> = {
  context: <GitBranch className="w-3.5 h-3.5" />,
  layers: <Layers className="w-3.5 h-3.5" />,
  directory: <FolderTree className="w-3.5 h-3.5" />,
  backends: <Database className="w-3.5 h-3.5" />,
}

const TAB_LABELS: Record<TreeTab, string> = {
  context: 'Context tree',
  layers: 'Context layers',
  directory: 'Directory tree',
  backends: 'Backends tree',
}

const tabForTree = (treeName: string, layerId?: string | null): TreeTab =>
  layerId ? 'layers' : treeName === 'directory' ? 'directory' : treeName === 'backends' ? 'backends' : 'context'

export function WorkspaceM2() {
  const { state, closeM2, openM2 } = useMenu()
  const isMobile = useIsMobile()
  const wsName = state.selectedEntityId
  const navigate = useNavigate()
  const location = useLocation()

  // Derive tab and path from URL pathname; UI-only state from query params
  const { treeName: urlTree, path: urlPath } = parseWorkspacePathFromUrl(location.pathname)
  const urlIsLayer = new URLSearchParams(location.search).get('layer') === '1'
  const urlLayerId = new URLSearchParams(location.search).get('layerId')
  const initialTab: TreeTab = tabForTree(urlTree, urlLayerId)

  const [wsLabel, setWsLabel] = useState<string | null>(null)
  const [wsId, setWsId] = useState<string | null>(null)
  const [wsStyle, setWsStyle] = useState<{ icon: string | null; color: string | null }>({ icon: null, color: null })
  const [activeTab, setActiveTab] = useState<TreeTab>(initialTab)
  const [contextTree, setContextTree] = useState<TreeNode | null>(null)
  const [directoryTree, setDirectoryTree] = useState<TreeNode | null>(null)
  const [backendsTree, setBackendsTree] = useState<TreeNode | null>(null)
  const [layers, setLayers] = useState<Layer[]>([])
  const [isLoadingContext, setIsLoadingContext] = useState(false)
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false)
  const [isLoadingBackends, setIsLoadingBackends] = useState(false)
  const [isLoadingLayers, setIsLoadingLayers] = useState(false)
  const [selectedPath, setSelectedPath] = useState(urlPath)
  // Backends-tree mirror roots with a resync (initial/catch-up scan) in flight
  // — badged with a spinner in the tree. Seeded from the backends list, kept
  // live via the backend.resync.changed ws event.
  const [resyncingPaths, setResyncingPaths] = useState<Set<string>>(new Set())
  const [contentPath, setContentPath] = useState<string | null>(urlIsLayer && urlPath !== '/' ? urlPath : null)
  const [searchQuery, setSearchQuery] = useState('')
  const [docClipboard, setDocClipboard] = useState<{ documentIds: number[]; operation: 'copy' | 'cut' } | null>(null)

  useEffect(() => {
    const handler = (e: CustomEvent) => setDocClipboard(e.detail ?? null)
    window.addEventListener('documents:clipboard', handler as EventListener)
    return () => window.removeEventListener('documents:clipboard', handler as EventListener)
  }, [])

  // Keep selectedPath in sync with the URL — handles external navigation (back/forward,
  // direct links, workspace-detail navigation) where setSelectedPath is never called.
  // Reset-on-prop-change happens during render (no effect round-trip).
  const [prevUrlPath, setPrevUrlPath] = useState(urlPath)
  if (urlPath !== prevUrlPath) {
    setPrevUrlPath(urlPath)
    setSelectedPath(urlPath)
  }

  const loadTree = useCallback(async (name: string, tab: TreeDataTab, force = false) => {
    const setLoading = tab === 'context' ? setIsLoadingContext : tab === 'directory' ? setIsLoadingDirectory : setIsLoadingBackends
    const setData = tab === 'context' ? setContextTree : tab === 'directory' ? setDirectoryTree : setBackendsTree
    setLoading(true)
    try {
      if (force) invalidateWorkspaceTreeCache(name, tab)
      const res = await getCachedWorkspaceTreeByName(name, tab, { force })
      setData(res)
    } catch {
      // tree unavailable
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLayers = useCallback(async (name: string) => {
    setIsLoadingLayers(true)
    try {
      const data = await listWorkspaceLayers(name, 'context')
      setLayers(data)
    } catch {
      setLayers([])
    } finally {
      setIsLoadingLayers(false)
    }
  }, [])

  useEffect(() => {
    if (!wsName) return
    const name = wsName
    let cancelled = false

    async function loadAll() {
      setIsLoadingContext(true)
      setIsLoadingDirectory(true)
      setIsLoadingBackends(true)
      setIsLoadingLayers(true)
      try {
        const [ctxRes, dirRes, beRes] = await Promise.allSettled([
          getCachedWorkspaceTreeByName(name, 'context'),
          getCachedWorkspaceTreeByName(name, 'directory'),
          getCachedWorkspaceTreeByName(name, 'backends'),
        ])
        // Fetch workspace details for label (non-blocking)
        getWorkspace(name).then(ws => { if (!cancelled) { setWsLabel(ws.label || null); setWsId(ws.id || null); setWsStyle({ icon: ws.icon ?? null, color: ws.color ?? null }) } }).catch(() => {})
        if (cancelled) return
        if (ctxRes.status === 'fulfilled') setContextTree(ctxRes.value)
        if (dirRes.status === 'fulfilled') setDirectoryTree(dirRes.value)
        if (beRes.status === 'fulfilled') setBackendsTree(beRes.value)
      } finally {
        if (!cancelled) {
          setIsLoadingContext(false)
          setIsLoadingDirectory(false)
          setIsLoadingBackends(false)
        }
      }
      try {
        const layerData = await listWorkspaceLayers(name, 'context')
        if (!cancelled) setLayers(layerData)
      } catch {
        // non-fatal
      } finally {
        if (!cancelled) setIsLoadingLayers(false)
      }
    }

    loadAll()
    return () => { cancelled = true }
  }, [wsName])

  const refreshAll = useCallback((name: string) => {
    loadTree(name, 'context', true)
    loadTree(name, 'directory', true)
    loadTree(name, 'backends', true)
    loadLayers(name)
  }, [loadTree, loadLayers])

  const handleRefresh = useCallback(() => {
    if (wsName) refreshAll(wsName)
  }, [wsName, refreshAll])

  // Refresh tree when a canvas is created from the detail page
  useEffect(() => {
    if (!wsName) return
    const handler = (e: CustomEvent) => {
      if (e.detail?.workspaceName === wsName) refreshAll(wsName)
    }
    window.addEventListener('workspace:tree:refresh', handler as EventListener)
    return () => window.removeEventListener('workspace:tree:refresh', handler as EventListener)
  }, [wsName, refreshAll])

  // Seed the resyncing set (covers opening the menu while a scan is running).
  useEffect(() => {
    if (!wsName) return
    let cancelled = false
    listBackends(wsName)
      .then(backends => {
        if (cancelled) return
        setResyncingPaths(new Set(backends.filter(b => b.resyncing && b.treePath).map(b => b.treePath as string)))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [wsName])

  // Subscribe to the workspace channel and refresh trees on relevant DB events:
  //  • context.path.changed — lock/unlock state shifts
  //  • tree.path.* / tree.layer.updated — folders created/moved/removed by any
  //    client (CLI, agents, browser extension)
  // Subscribe by BOTH name and id: synapsd tree events carry only workspaceId,
  // so a name-only subscription would never receive them.
  useEffect(() => {
    if (!wsName) return
    const channels = [`workspace:${wsName}`, wsId ? `workspace:${wsId}` : null].filter(Boolean) as string[]
    const subscribe = () => channels.forEach(ch => socketService.emit('subscribe', { channel: ch }))
    const offConnect = socketService.on('connect', subscribe)
    subscribe()

    let timer: ReturnType<typeof setTimeout> | null = null
    const refreshSoon = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => refreshAll(wsName), 200)
    }
    const events = [
      'context.path.changed',
      'tree.path.inserted', 'tree.path.moved', 'tree.path.removed', 'tree.path.copied',
      'tree.layer.updated', 'tree.layer.merged', 'tree.layer.subtracted',
      'tree.recalculated', 'tree.created', 'tree.deleted', 'tree.renamed',
    ]
    events.forEach(ev => socketService.on(ev, refreshSoon))

    // Live resync badge: toggle the spinner on the backend's mirror node; when
    // a scan finishes, refresh the trees once so final counts/paths settle.
    const onResync = (payload: { workspaceId?: string; treePath?: string | null; resyncing?: boolean }) => {
      if (payload?.workspaceId && wsId && payload.workspaceId !== wsId) return
      const treePath = payload?.treePath
      if (!treePath) return
      setResyncingPaths(prev => {
        const next = new Set(prev)
        if (payload.resyncing) next.add(treePath); else next.delete(treePath)
        return next
      })
      if (!payload.resyncing) refreshSoon()
    }
    socketService.on('backend.resync.changed', onResync)

    return () => {
      if (timer) clearTimeout(timer)
      channels.forEach(ch => socketService.emit('unsubscribe', { channel: ch }))
      offConnect?.()
      events.forEach(ev => socketService.off(ev, refreshSoon))
      socketService.off('backend.resync.changed', onResync)
    }
  }, [wsName, wsId, refreshAll])

  // Sync active tab and selected path when URL pathname changes externally.
  // Runs during render (prev-value-in-state) — initialised to null so the
  // first render applies the URL-derived state exactly like the old
  // mount-effect did.
  const [prevLocKey, setPrevLocKey] = useState<string | null>(null)
  const locKey = `${location.pathname}|${location.search}`
  if (locKey !== prevLocKey) {
    setPrevLocKey(locKey)
    const { treeName: tree, path } = parseWorkspacePathFromUrl(location.pathname)
    // A selected layer (layerId param) keeps us on the Layers tab — otherwise the
    // pathname-only derivation would kick us back to the context tree.
    const layerId = new URLSearchParams(location.search).get('layerId')
    const tab: TreeTab = tabForTree(tree, layerId)
    setActiveTab(tab)
    setSelectedPath(path)
    setContentPath(path !== '/' ? path : null)
  }

  const { showToast } = useToast()
  // Folder-skeleton sync for one backends subtree: runs the shipped
  // started/…backend-tree-sync.js hook by hand with the subtree as payload
  // (backend + subdir → dir:/<rel>), so empty folders land in the directory
  // tree even though no document ever passes through a rule for them.
  const handleSyncFolderTree = useCallback(async (path: string): Promise<boolean> => {
    if (!wsName) return false
    const parts = splitBackendsPath(path)
    if (!parts) throw new Error('Not a backend folder')
    const hookFile = findBackendTreeSyncHook(await listHooks(wsName))
    if (!hookFile) throw new Error('No backend-tree-sync hook in this workspace (git/hooks/started/). Recreate the seed hooks from Settings → Hooks.')
    const res = await runHook(wsName, {
      hookFile,
      payload: { backend: parts.backend, subdir: parts.rel, target: defaultMirrorTarget(path) },
    })
    if (res.status === 'error') throw new Error(res.error || 'Sync failed')
    showToast({ title: 'Folders synced', description: `${parts.backend}${parts.rel ? `/${parts.rel}` : ''} → ${defaultMirrorTarget(path)} (see Hooks → Runs)` })
    refreshAll(wsName)
    return true
  }, [wsName, showToast, refreshAll])

  const ops = useTreeOperations({
    workspaceId: wsName ?? undefined,
    treeName: activeTab === 'layers' ? 'context' : activeTab,
    onRefresh: handleRefresh,
  })

  const activeTree = activeTab === 'context' ? contextTree
    : activeTab === 'directory' ? directoryTree
    : activeTab === 'backends' ? backendsTree
    : null
  const isLoadingTree = activeTab === 'context' ? isLoadingContext
    : activeTab === 'directory' ? isLoadingDirectory
    : activeTab === 'backends' ? isLoadingBackends
    : false

  const handleTabChange = (tab: TreeTab) => {
    setActiveTab(tab)
    setSelectedPath('/')
    setContentPath(null)
    setSearchQuery('')
  }

  const handlePathSelect = (path: string) => {
    setContentPath(null)
    setSelectedPath(path)
    const treeName = activeTab === 'layers' ? DEFAULT_WORKSPACE_TREE_NAME : activeTab
    // Path is the URL truth — leaf type / canvas id are derived from the path
    // by the workspace page itself. No type-specific query params here.
    navigate(buildWorkspaceUrl(wsName!, path, treeName))
  }

  const handleShowContent = useCallback((path: string, layerId?: string) => {
    setSelectedPath(path)
    setContentPath(path)
    const treeName = activeTab === 'layers' ? DEFAULT_WORKSPACE_TREE_NAME : activeTab
    const uiParams = new URLSearchParams()
    uiParams.set('layer', '1')
    // Resolve the single layer's own bitmap (same as picking it in the layers
    // tab) instead of the path-AND read. Context-tree only — the directory tree
    // already shows per-folder layers and doesn't offer this action.
    if (layerId) uiParams.set('layerId', layerId)
    navigate(`${buildWorkspaceUrl(wsName!, path, treeName)}?${uiParams.toString()}`)
  }, [wsName, activeTab, navigate])

  const handleOpenToSide = useCallback((path: string, treeName: string) => {
    if (!wsName) return
    window.dispatchEvent(new CustomEvent('workspace:open-to-side', {
      detail: { workspaceName: wsName, treeName, path },
    }))
  }, [wsName])

  const handleShareCanvas = useCallback(async (path: string) => {
    if (!wsName) return
    const treeName = activeTab === 'layers' ? DEFAULT_WORKSPACE_TREE_NAME : activeTab
    const share = await createPublicCanvasShare(wsName, path, treeName)
    const url = `${window.location.origin}${share.url}`
    await navigator.clipboard?.writeText(url)
    alert(`Canvas share link copied:\n${url}`)
  }, [wsName, activeTab])

  const q = searchQuery.toLowerCase().trim()
  const filteredLayers = q ? layers.filter(l =>
    l.name.toLowerCase().includes(q) ||
    (l.label || '').toLowerCase().includes(q) ||
    (l.description || '').toLowerCase().includes(q)
  ) : layers

  return (
    <div className="flex flex-col h-full">
      <M2Header
        title={wsLabel || wsName || 'Workspace'}
        icon={wsStyle.icon || DEFAULT_WORKSPACE_ICON}
        accentColor={wsStyle.color}
        onBack={closeM2}
        action={
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => navigate(`/workspaces/${wsName}`)}
              className="flex items-center justify-center w-8 h-8 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
              title="Open workspace"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              // Desktop: M2 stays open and the URL sync swaps it to the settings
              // section list, so the sections stay on screen next to the page.
              // Mobile: the drawer is an overlay that any navigation closes, so
              // going straight to a section would strand the user in General with
              // no way back to the list — show the list as its own step instead
              // (same rule as the workspace row's gear in M1).
              onClick={() => {
                if (isMobile) openM2('settings', wsName ?? null)
                else navigate(`/workspaces/${wsName}/settings/general`)
              }}
              className="flex items-center justify-center w-8 h-8 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      />

      {/* Tab bar — icon only */}
      <div className="flex border-b border-border shrink-0">
        {TAB_ORDER.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabChange(tab)}
            title={TAB_LABELS[tab]}
            className={cn(
              'flex-1 flex items-center justify-center py-2 transition-colors',
              activeTab === tab
                ? 'text-foreground border-b-2 border-foreground -mb-px'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {TAB_ICONS[tab]}
          </button>
        ))}
      </div>

      {/* Search box — shared across all tabs */}
      <div className="px-2 py-1.5 border-b border-border shrink-0 shadow-elevation-2 z-10">
        <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1">
          <Search className="w-3 h-3 shrink-0 text-muted-foreground" />
          <input
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground min-w-0"
            placeholder={activeTab === 'layers' ? 'Search layers…' : 'Search paths…'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'layers' ? (
          <LayersList
            layers={filteredLayers}
            isLoading={isLoadingLayers}
            wsName={wsName ?? ''}
            onSelect={layer => {
              const uiParams = new URLSearchParams()
              uiParams.set('layerId', layer.id)
              uiParams.set('layer', '1')
              navigate(`${buildWorkspaceUrl(wsName!, '/')}?${uiParams.toString()}`)
            }}
            onLock={async layer => {
              await lockWorkspaceLayer(wsName!, layer.id, wsName!, 'context')
              refreshAll(wsName!)
            }}
            onUnlock={async layer => {
              await unlockWorkspaceLayer(wsName!, layer.id, wsName!, 'context')
              refreshAll(wsName!)
            }}
            onRename={async (layer, newName) => {
              await renameWorkspaceLayer(wsName!, layer.id, newName, 'context')
              refreshAll(wsName!)
            }}
            onDestroy={async layer => {
              if (!confirm(`Destroy layer "${layer.label || layer.name}"? This cannot be undone.`)) return
              await destroyWorkspaceLayer(wsName!, layer.id, 'context')
              refreshAll(wsName!)
            }}
          />
        ) : (
          <MenuTreeView
            root={activeTree}
            treeName={activeTab}
            isBackendsTree={activeTab === 'backends'}
            selectedPath={selectedPath}
            contentPath={contentPath}
            onSelect={handlePathSelect}
            onShowContent={activeTab === 'context' ? handleShowContent : undefined}
            onOpenToSide={handleOpenToSide}
            onShareCanvas={handleShareCanvas}
            onNewCanvas={wsName && activeTab !== 'backends' ? (parentPath) => {
              // Select the parent path and ask the content area to open the
              // create form there — canvases capture the current view, so the
              // form has to live where that view is.
              navigate(`${buildWorkspaceUrl(wsName, parentPath, activeTab)}?createCanvas=1`)
            } : undefined}
            isLoading={isLoadingTree}
            rootLabel={wsName ?? undefined}
            searchQuery={searchQuery}
            resyncingPaths={activeTab === 'backends' ? resyncingPaths : undefined}
            onAddRule={wsName && activeTab === 'backends' ? (path) => {
              // Rule builder (settings → Hooks) prefilled: everything under this
              // backends folder → the same folder in the directory tree, recursive.
              const params = new URLSearchParams({ addRulePath: `backends:${path}`, addRuleTarget: defaultMirrorTarget(path) })
              navigate(`/workspaces/${wsName}/settings/hooks?${params.toString()}`)
            } : undefined}
            onSyncFolderTree={wsName && activeTab === 'backends' ? handleSyncFolderTree : undefined}
            pastedDocumentIds={docClipboard?.documentIds}
            onPasteDocuments={wsName && activeTab !== 'backends' ? async (path, ids) => {
              // Ungated on the clipboard: also serves drag-and-drop from the
              // content area (no prior "Copy" involved). The backends tree is
              // read-only (mirrors backend storage) — no paste target there.
              const treeType: 'context' | 'directory' = activeTab === 'directory' ? 'directory' : 'context'
              const treeName = activeTab === 'directory' ? 'directory' : DEFAULT_WORKSPACE_TREE_NAME
              const success = await pasteDocumentsToWorkspacePath(wsName, path, ids, treeName, treeType)
              if (success) {
                if (docClipboard) {
                  setDocClipboard(null)
                  window.dispatchEvent(new CustomEvent('documents:clipboard', { detail: null }))
                }
                window.dispatchEvent(new CustomEvent('workspace:documents:refresh', {
                  detail: { workspaceName: wsName, path, treeName },
                }))
              }
              return success
            } : undefined}
            {...ops}
          />
        )}
      </div>
    </div>
  )
}

// ─── Layers list ──────────────────────────────────────────────────────────────

// Layer-type grouping. The list is divided into per-type sections rendered in
// this order — canvases first, then the (future) dataset type, then plain
// context layers, then the rest. Types not listed here fall through to a
// title-cased group ordered after the known ones. Forward-compatible: a new
// backend layer type shows up as its own section without a code change.
const LAYER_TYPE_META: Record<string, { label: string; order: number }> = {
  canvas: { label: 'Canvases', order: 0 },
  dataset: { label: 'Datasets', order: 1 },
  context: { label: 'Context layers', order: 2 },
  workspace: { label: 'Workspaces', order: 3 },
  universe: { label: 'Universe', order: 4 },
  label: { label: 'Labels', order: 5 },
  system: { label: 'System', order: 6 },
}
const UNKNOWN_TYPE_ORDER = 100

const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const layerTypeMeta = (type: string): { label: string; order: number } =>
  LAYER_TYPE_META[type] ?? { label: `${titleCase(type)} layers`, order: UNKNOWN_TYPE_ORDER }

// Per-type row icon (matches the group it sits under).
function LayerTypeIcon({ type }: { type: string }) {
  if (type === 'canvas')
    return <LayoutDashboard className="w-3.5 h-3.5 shrink-0 text-primary" aria-label="Canvas" />
  if (type === 'dataset')
    return <Database className="w-3.5 h-3.5 shrink-0 text-secondary" aria-label="Dataset" />
  return <Layers className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" aria-label="Layer" />
}

// Group a flat layer list into ordered per-type sections.
function groupLayersByType(layers: Layer[]): Array<{ type: string; label: string; items: Layer[] }> {
  const byType = new Map<string, Layer[]>()
  for (const layer of layers) {
    const type = layer.type || 'context'
    const bucket = byType.get(type)
    if (bucket) bucket.push(layer)
    else byType.set(type, [layer])
  }
  return [...byType.entries()]
    .map(([type, items]) => ({ type, items, meta: layerTypeMeta(type) }))
    .sort((a, b) => a.meta.order - b.meta.order || a.meta.label.localeCompare(b.meta.label))
    .map(({ type, items, meta }) => ({ type, label: meta.label, items }))
}

interface LayersListProps {
  layers: Layer[]
  isLoading: boolean
  wsName: string
  onSelect: (layer: Layer) => void
  onLock: (layer: Layer) => Promise<void>
  onUnlock: (layer: Layer) => Promise<void>
  onRename: (layer: Layer, newName: string) => Promise<void>
  onDestroy: (layer: Layer) => Promise<void>
}

function LayersList({ layers, isLoading, onSelect, onLock, onUnlock, onRename, onDestroy }: LayersListProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  if (isLoading) return <div className="px-3 py-3 text-xs text-muted-foreground">Loading layers…</div>
  if (!layers.length) return <div className="px-3 py-3 text-xs text-muted-foreground">No layers found</div>

  const act = async (e: React.MouseEvent, fn: () => Promise<void>) => {
    e.stopPropagation()
    try { await fn() } catch (err) { alert(err instanceof Error ? err.message : String(err)) }
  }

  const commitRename = async (layer: Layer, val: string) => {
    setRenamingId(null)
    const trimmed = val.trim()
    if (!trimmed || trimmed === layer.name) return
    try { await onRename(layer, trimmed) } catch (err) { alert(err instanceof Error ? err.message : String(err)) }
  }

  const groups = groupLayersByType(layers)

  return (
    <div className="px-2 py-1.5 space-y-2">
      {groups.map(group => (
        <div key={group.type} className="space-y-0.5">
          <div className="px-1 pt-1 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {group.label}
            <span className="ml-1 text-muted-foreground/60">({group.items.length})</span>
          </div>
          {group.items.map(layer => (
        <div
          key={layer.id}
          className="group flex items-center gap-2 rounded-l-md px-2 py-1.5 text-xs bg-card shadow-elevation-1 cursor-pointer hover:bg-accent/40 transition-colors"
          style={{ borderRight: layer.color ? `4px solid ${layer.color}` : '4px solid transparent' }}
          onClick={() => renamingId !== layer.id && onSelect(layer)}
        >
          <div
            className={cn('w-2 h-2 rounded-full shrink-0', !layer.color && 'bg-muted-foreground/20')}
            style={layer.color ? { backgroundColor: layer.color } : undefined}
          />

          <LayerTypeIcon type={layer.type} />

          {renamingId === layer.id ? (
            <input
              ref={renameInputRef}
              defaultValue={layer.label || layer.name}
              className="flex-1 bg-transparent outline-none min-w-0 font-medium border-b border-primary"
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename(layer, (e.target as HTMLInputElement).value)
                if (e.key === 'Escape') setRenamingId(null)
              }}
              onBlur={e => commitRename(layer, e.target.value)}
            />
          ) : (
            <span className="flex-1 truncate font-medium">{layer.label || layer.name}</span>
          )}

          {/* Lock indicator — always visible when locked, hidden during rename */}
          {layer.locked && renamingId !== layer.id && (
            <Lock className="w-2.5 h-2.5 shrink-0 text-warning group-hover:hidden" />
          )}

          {/* Action buttons — visible on hover */}
          {renamingId !== layer.id && (
            <div className="flex items-center gap-0.5 reveal-on-hover">
              {layer.locked ? (
                <button
                  type="button"
                  title="Unlock layer"
                  className="p-0.5 rounded hover:bg-muted-foreground/10 text-warning hover:text-foreground touch-target"
                  onClick={e => act(e, () => onUnlock(layer))}
                >
                  <Unlock className="w-3 h-3" />
                </button>
              ) : (
                <button
                  type="button"
                  title="Lock layer"
                  className="p-0.5 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground touch-target"
                  onClick={e => act(e, () => onLock(layer))}
                >
                  <Lock className="w-3 h-3" />
                </button>
              )}
              {!layer.locked && (
                <button
                  type="button"
                  title="Rename layer"
                  className="p-0.5 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground touch-target"
                  onClick={e => { e.stopPropagation(); setRenamingId(layer.id) }}
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
              {!layer.locked && (
                <button
                  type="button"
                  title="Destroy layer"
                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive touch-target"
                  onClick={e => act(e, () => onDestroy(layer))}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
          ))}
        </div>
      ))}
    </div>
  )
}
