import { useEffect, useState, useCallback } from 'react'
import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { M2Header } from '@/components/menu/shared/M2Header'
import { DEFAULT_WORKSPACE_ICON } from '@/lib/layer-style'
import { MenuTreeView } from '@/components/menu/shared/MenuTreeView'
import { useMenu } from '@/components/shell/use-menu'
import { useIsMobile } from '@/hooks/use-mobile'
import { useNavigate } from 'react-router-dom'
import { getContext, updateContextUrl, getContextTree } from '@/services/context'
import { useTreeOperations } from '@/hooks/useTreeOperations'
import type { TreeNode } from '@/types/workspace'

export function ContextM2Detail() {
  const { state, closeM2, closeM1, closeM0, openM2 } = useMenu()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const entityId = state.selectedEntityId
  const { showToast } = useToast()

  const [context, setContext] = useState<Context | null>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [url, setUrl] = useState('')
  const [selectedPath, setSelectedPath] = useState('/')
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [isLoadingTree, setIsLoadingTree] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const loadTree = useCallback(async (id: string) => {
    setIsLoadingTree(true)
    try {
      const treeData = await getContextTree(id)
      setTree(treeData)
    } catch {
      // tree unavailable — workspace may be inactive
    } finally {
      setIsLoadingTree(false)
    }
  }, [])

  useEffect(() => {
    if (!entityId) return
    const id = entityId
    let cancelled = false

    async function load() {
      try {
        const ctx = await getContext(id)
        if (cancelled) return
        setContext(ctx)
        setUrl(ctx.url || '')
        setSelectedPath(ctx.path || '/')

        setIsLoadingTree(true)
        try {
          const treeData = await getContextTree(id)
          if (!cancelled) setTree(treeData)
        } finally {
          if (!cancelled) setIsLoadingTree(false)
        }
      } catch {
        if (!cancelled) showToast({ title: 'Error', description: 'Failed to load context', variant: 'destructive' })
      }
    }
    load()
    return () => { cancelled = true }
    // showToast is stable (useCallback with no deps in ToastContainer).
  }, [entityId, showToast])

  const ops = useTreeOperations({
    contextId: entityId ?? undefined,
    onRefresh: () => { if (entityId) loadTree(entityId) },
  })

  // Tree click previews into the single URL input (with the pending tint in
  // the tree) — the one Set button commits whatever the input holds.
  const handleTreeSelect = (path: string) => {
    setPendingPath(path)
    setUrl(context?.workspaceName ? `${context.workspaceName}://${path.replace(/^\//, '')}` : path)
  }

  // Selected/typed but not committed yet — tint the input amber until Set.
  const isDirtyUrl = context != null && url.trim() !== (context.url || '')

  const handleSave = async () => {
    if (!entityId) return
    const id = entityId
    setIsSaving(true)
    try {
      await updateContextUrl(id, url)
      const prefix = context?.workspaceName ? `${context.workspaceName}://` : null
      const committedPath = prefix && url.startsWith(prefix) ? `/${url.slice(prefix.length).replace(/^\/+/, '')}` : selectedPath
      setSelectedPath(committedPath)
      setPendingPath(null)
      // The input now shows the committed URL — clear the dirty tint.
      setContext(prev => (prev ? { ...prev, url } : prev))
      window.dispatchEvent(new CustomEvent('contexts:refresh'))
      // Refetch tree so newly auto-locked layers along the new URL render with the locked tint
      await loadTree(id)
      showToast({ title: 'Saved', description: 'Context URL updated' })
      // Mobile: the M1/M2 drawer covers the page — setting the URL is the end
      // of the task, so return to the document view underneath.
      if (window.matchMedia('(max-width: 767px)').matches) {
        closeM1()
        closeM0()
      }
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Save failed', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <M2Header
        title={entityId || 'Context'}
        icon={context?.icon || DEFAULT_WORKSPACE_ICON}
        accentColor={context?.color}
        onBack={closeM2}
        action={
          <button
            type="button"
            // Mobile shows the section list as its own step — navigating closes
            // the drawer, so jumping to a section strands the user in General.
            onClick={() => {
              if (!entityId) return
              if (isMobile) openM2('settings', entityId)
              else navigate(`/contexts/${entityId}/settings/general`)
            }}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        }
      />

      {/* URL editor */}
      <div className="p-3 border-b border-border shrink-0">
        <div className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Context URL</div>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            className={cn(
              'text-xs h-7 font-mono transition-colors',
              isDirtyUrl && 'border-warning/60 bg-warning/10',
            )}
            placeholder="workspace://path"
            title={isDirtyUrl ? 'Not applied yet — press Set' : undefined}
          />
          <Button size="sm" className="h-7 px-2 text-xs shrink-0" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '…' : 'Set'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="text-[10px] text-muted-foreground px-3 pt-2 pb-1 font-medium uppercase tracking-wide shrink-0">
          {context?.workspaceName || 'Workspace'} · {tree?.type === 'directory' ? 'directory' : 'context'} tree
        </div>
        <MenuTreeView
          root={tree}
          selectedPath={selectedPath}
          pendingPath={pendingPath}
          onSelect={handleTreeSelect}
          isLoading={isLoadingTree}
          rootLabel={context?.workspaceName}
          {...ops}
        />
      </div>
    </div>
  )
}
