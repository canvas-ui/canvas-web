import { useEffect, useState, useCallback } from 'react'
import { Settings, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { M2Header } from '@/components/menu/shared/M2Header'
import { MenuTreeView } from '@/components/menu/shared/MenuTreeView'
import { useMenu } from '@/components/shell/menu-context'
import { getWorkspaceTreeByName } from '@/services/workspace'
import { useTreeOperations } from '@/hooks/useTreeOperations'
import type { TreeNode } from '@/types/workspace'

type TreeTab = 'context' | 'directory'

export function WorkspaceM2() {
  const { state, closeM2, openM2 } = useMenu()
  const wsName = state.selectedEntityId
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<TreeTab>('context')
  const [contextTree, setContextTree] = useState<TreeNode | null>(null)
  const [directoryTree, setDirectoryTree] = useState<TreeNode | null>(null)
  const [isLoadingContext, setIsLoadingContext] = useState(false)
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false)
  const [selectedPath, setSelectedPath] = useState('/')
  const [contentPath, setContentPath] = useState<string | null>(null)

  const loadTree = useCallback(async (name: string, tab: TreeTab) => {
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

  useEffect(() => {
    if (!wsName) return
    const name = wsName
    let cancelled = false

    async function loadTrees() {
      setIsLoadingContext(true)
      setIsLoadingDirectory(true)
      try {
        const [ctxRes, dirRes] = await Promise.allSettled([
          getWorkspaceTreeByName(name, 'context'),
          getWorkspaceTreeByName(name, 'directory'),
        ])
        if (cancelled) return
        if (ctxRes.status === 'fulfilled') setContextTree(ctxRes.value.payload)
        if (dirRes.status === 'fulfilled') setDirectoryTree(dirRes.value.payload)
      } finally {
        if (!cancelled) {
          setIsLoadingContext(false)
          setIsLoadingDirectory(false)
        }
      }
    }
    loadTrees()
    return () => { cancelled = true }
  }, [wsName])

  const handleRefresh = useCallback(() => {
    if (wsName) loadTree(wsName, activeTab)
  }, [wsName, activeTab, loadTree])

  const ops = useTreeOperations({
    workspaceId: wsName ?? undefined,
    treeName: activeTab,
    onRefresh: handleRefresh,
  })

  const activeTree = activeTab === 'context' ? contextTree : directoryTree
  const isLoading = activeTab === 'context' ? isLoadingContext : isLoadingDirectory

  const handleTabChange = (tab: TreeTab) => {
    setActiveTab(tab)
    setSelectedPath('/')
    setContentPath(null)
  }

  const handlePathSelect = (path: string) => {
    setContentPath(null)
    setSelectedPath(path)
    const params = new URLSearchParams()
    params.set('tree', activeTab)
    if (path !== '/') params.set('path', path)
    navigate(`/workspaces/${wsName}?${params.toString()}`)
  }

  const handleShowContent = useCallback((path: string) => {
    setSelectedPath(path)
    setContentPath(path)
    const params = new URLSearchParams()
    params.set('tree', activeTab)
    if (path !== '/') params.set('path', path)
    params.set('layer', '1')
    navigate(`/workspaces/${wsName}?${params.toString()}`)
  }, [wsName, activeTab, navigate])

  return (
    <div className="flex flex-col h-full">
      <M2Header
        title={wsName || 'Workspace'}
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

      <div className="flex border-b border-sidebar-border shrink-0">
        {(['context', 'directory'] as TreeTab[]).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabChange(tab)}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors',
              activeTab === tab
                ? 'text-foreground border-b-2 border-foreground -mb-px'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <MenuTreeView
          root={activeTree}
          selectedPath={selectedPath}
          contentPath={contentPath}
          onSelect={handlePathSelect}
          onShowContent={handleShowContent}
          isLoading={isLoading}
          rootLabel={wsName ?? undefined}
          {...ops}
        />
      </div>
    </div>
  )
}
