import { useEffect, useState, useCallback, useRef } from 'react'
import { Settings, ExternalLink, GitBranch, FolderTree, Layers, Search, Lock, Unlock, Edit2, Trash2 } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { M2Header } from '@/components/menu/shared/M2Header'
import { MenuTreeView } from '@/components/menu/shared/MenuTreeView'
import { useMenu } from '@/components/shell/menu-context'
import { getWorkspace, getWorkspaceTreeByName, listWorkspaceLayers, lockWorkspaceLayer, unlockWorkspaceLayer, renameWorkspaceLayer, destroyWorkspaceLayer, pasteDocumentsToWorkspacePath } from '@/services/workspace'
import type { Layer } from '@/services/workspace'
import { useTreeOperations } from '@/hooks/useTreeOperations'
import type { TreeNode } from '@/types/workspace'
import socketService from '@/lib/socket'

type TreeTab = 'context' | 'directory' | 'layers'

function findNodeByPath(root: TreeNode | null, path: string): TreeNode | null {
  if (!root || path === '/') return root
  const parts = path.split('/').filter(Boolean)
  let node: TreeNode | null = root
  for (const part of parts) {
    node = node?.children?.find(c => c.name === part) ?? null
    if (!node) return null
  }
  return node
}

const TAB_ICONS: Record<TreeTab, React.ReactNode> = {
  context: <GitBranch className="w-3.5 h-3.5" />,
  directory: <FolderTree className="w-3.5 h-3.5" />,
  layers: <Layers className="w-3.5 h-3.5" />,
}

const TAB_LABELS: Record<TreeTab, string> = {
  context: 'Context tree',
  directory: 'Directory tree',
  layers: 'Layers',
}

export function WorkspaceM2() {
  const { state, closeM2, openM2 } = useMenu()
  const wsName = state.selectedEntityId
  const navigate = useNavigate()
  const location = useLocation()

  // Derive tab and path from the current URL on every render
  const urlParams = new URLSearchParams(location.search)
  const urlTree = urlParams.get('tree')
  const urlPath = urlParams.get('path') ? decodeURIComponent(urlParams.get('path')!) : '/'
  const urlIsLayer = urlParams.get('layer') === '1'
  const initialTab: TreeTab = urlTree === 'directory' ? 'directory' : 'context'

  const [wsLabel, setWsLabel] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TreeTab>(initialTab)
  const [contextTree, setContextTree] = useState<TreeNode | null>(null)
  const [directoryTree, setDirectoryTree] = useState<TreeNode | null>(null)
  const [layers, setLayers] = useState<Layer[]>([])
  const [isLoadingContext, setIsLoadingContext] = useState(false)
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false)
  const [isLoadingLayers, setIsLoadingLayers] = useState(false)
  const [selectedPath, setSelectedPath] = useState(urlPath)
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
  useEffect(() => {
    setSelectedPath(urlPath)
  }, [urlPath])

  const loadTree = useCallback(async (name: string, tab: 'context' | 'directory') => {
    const setLoading = tab === 'context' ? setIsLoadingContext : setIsLoadingDirectory
    const setData = tab === 'context' ? setContextTree : setDirectoryTree
    setLoading(true)
    try {
      const res = await getWorkspaceTreeByName(name, tab)
      setData(res.payload)
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
      setIsLoadingLayers(true)
      try {
        const [ctxRes, dirRes] = await Promise.allSettled([
          getWorkspaceTreeByName(name, 'context'),
          getWorkspaceTreeByName(name, 'directory'),
        ])
        // Fetch workspace details for label (non-blocking)
        getWorkspace(name).then(ws => { if (!cancelled) setWsLabel(ws.label || null) }).catch(() => {})
        if (cancelled) return
        if (ctxRes.status === 'fulfilled') setContextTree(ctxRes.value.payload)
        if (dirRes.status === 'fulfilled') setDirectoryTree(dirRes.value.payload)
      } finally {
        if (!cancelled) {
          setIsLoadingContext(false)
          setIsLoadingDirectory(false)
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
    loadTree(name, 'context')
    loadTree(name, 'directory')
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

  // Subscribe to workspace channel and refresh trees when a context changes its path
  // (which locks/unlocks layers, so trees must reflect updated lock state)
  useEffect(() => {
    if (!wsName) return
    const channel = `workspace:${wsName}`
    const subscribe = () => socketService.emit('subscribe', { channel })
    const offConnect = socketService.on('connect', subscribe)
    subscribe()

    const handleContextPathChanged = () => { refreshAll(wsName) }
    socketService.on('context.path.changed', handleContextPathChanged)

    return () => {
      socketService.emit('unsubscribe', { channel })
      offConnect?.()
      socketService.off('context.path.changed', handleContextPathChanged)
    }
  }, [wsName, refreshAll])

  // Sync active tab and selected path when URL search params change externally
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tree = params.get('tree')
    const path = params.get('path') ? decodeURIComponent(params.get('path')!) : '/'
    const tab: TreeTab = tree === 'directory' ? 'directory' : 'context'
    setActiveTab(tab)
    setSelectedPath(path)
    setContentPath(path !== '/' ? path : null)
  }, [location.search])

  const ops = useTreeOperations({
    workspaceId: wsName ?? undefined,
    treeName: activeTab === 'layers' ? 'context' : activeTab,
    onRefresh: handleRefresh,
  })

  const activeTree = activeTab === 'context' ? contextTree : activeTab === 'directory' ? directoryTree : null
  const isLoadingTree = activeTab === 'context' ? isLoadingContext : activeTab === 'directory' ? isLoadingDirectory : false

  const handleTabChange = (tab: TreeTab) => {
    setActiveTab(tab)
    setSelectedPath('/')
    setContentPath(null)
    setSearchQuery('')
  }

  const handlePathSelect = (path: string) => {
    setContentPath(null)
    setSelectedPath(path)
    const params = new URLSearchParams()
    params.set('tree', activeTab === 'layers' ? 'context' : activeTab)
    if (path !== '/') params.set('path', path)
    const node = findNodeByPath(activeTree, path)
    if (node?.type === 'canvas') {
      params.set('nodeType', 'canvas')
      if (node.id) params.set('canvasId', node.id)
    }
    navigate(`/workspaces/${wsName}?${params.toString()}`)
  }

  const handleShowContent = useCallback((path: string) => {
    setSelectedPath(path)
    setContentPath(path)
    const params = new URLSearchParams()
    params.set('tree', activeTab === 'layers' ? 'context' : activeTab)
    if (path !== '/') params.set('path', path)
    params.set('layer', '1')
    navigate(`/workspaces/${wsName}?${params.toString()}`)
  }, [wsName, activeTab, navigate])

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
              onClick={() => openM2('form', wsName)}
              className="flex items-center justify-center w-8 h-8 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      />

      {/* Tab bar — icon only */}
      <div className="flex border-b border-sidebar-border shrink-0">
        {(['context', 'directory', 'layers'] as TreeTab[]).map(tab => (
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
      <div className="px-2 py-1.5 border-b border-sidebar-border shrink-0">
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
              const params = new URLSearchParams()
              params.set('tree', 'context')
              params.set('layerId', layer.id)
              params.set('layer', '1')
              navigate(`/workspaces/${wsName}?${params.toString()}`)
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
            selectedPath={selectedPath}
            contentPath={contentPath}
            onSelect={handlePathSelect}
            onShowContent={handleShowContent}
            isLoading={isLoadingTree}
            rootLabel={wsName ?? undefined}
            searchQuery={searchQuery}
            pastedDocumentIds={docClipboard?.documentIds}
            onPasteDocuments={docClipboard && wsName ? async (path, ids) => {
              const treeType: 'context' | 'directory' = activeTab === 'directory' ? 'directory' : 'context'
              const success = await pasteDocumentsToWorkspacePath(wsName, path, ids, treeType, treeType)
              if (success) setDocClipboard(null)
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

  return (
    <div className="px-2 py-1.5 space-y-0.5">
      {layers.map(layer => (
        <div
          key={layer.id}
          className="group flex items-center gap-2 rounded-l-md px-2 py-1.5 text-xs bg-card shadow-sm cursor-pointer hover:bg-accent/40 transition-colors"
          style={{ borderRight: layer.color ? `4px solid ${layer.color}` : '4px solid transparent' }}
          onClick={() => renamingId !== layer.id && onSelect(layer)}
        >
          <div
            className={cn('w-2 h-2 rounded-full shrink-0', !layer.color && 'bg-muted-foreground/20')}
            style={layer.color ? { backgroundColor: layer.color } : undefined}
          />

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
            <Lock className="w-2.5 h-2.5 shrink-0 text-amber-500 group-hover:hidden" />
          )}

          {/* Action buttons — visible on hover */}
          {renamingId !== layer.id && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
              {layer.locked ? (
                <button
                  type="button"
                  title="Unlock layer"
                  className="p-0.5 rounded hover:bg-muted-foreground/10 text-amber-500 hover:text-foreground"
                  onClick={e => act(e, () => onUnlock(layer))}
                >
                  <Unlock className="w-3 h-3" />
                </button>
              ) : (
                <button
                  type="button"
                  title="Lock layer"
                  className="p-0.5 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground"
                  onClick={e => act(e, () => onLock(layer))}
                >
                  <Lock className="w-3 h-3" />
                </button>
              )}
              {!layer.locked && (
                <button
                  type="button"
                  title="Rename layer"
                  className="p-0.5 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground"
                  onClick={e => { e.stopPropagation(); setRenamingId(layer.id) }}
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
              {!layer.locked && (
                <button
                  type="button"
                  title="Destroy layer"
                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
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
  )
}
