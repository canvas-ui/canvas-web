import { useEffect, useState, useCallback } from 'react'
import { Settings, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import { M2Header } from '@/components/menu/shared/M2Header'
import { MenuTreeView } from '@/components/menu/shared/MenuTreeView'
import { useMenu } from '@/components/shell/menu-context'
import { getContext, updateContextUrl, getContextTree } from '@/services/context'
import { useTreeOperations } from '@/hooks/useTreeOperations'
import type { TreeNode } from '@/types/workspace'

export function ContextM2Detail() {
  const { state, closeM2, openM2 } = useMenu()
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
  }, [entityId])

  const ops = useTreeOperations({
    contextId: entityId ?? undefined,
    onRefresh: () => { if (entityId) loadTree(entityId) },
  })

  // Regular tree node click: preview path before committing
  const handleTreeSelect = (path: string) => {
    setPendingPath(path)
  }

  const handleConfirmPending = async () => {
    if (!pendingPath || !entityId) return
    const id = entityId
    const newUrl = context?.workspaceName
      ? `${context.workspaceName}://${pendingPath.replace(/^\//, '')}`
      : pendingPath
    setIsSaving(true)
    try {
      await updateContextUrl(id, newUrl)
      setUrl(newUrl)
      setSelectedPath(pendingPath)
      setPendingPath(null)
      window.dispatchEvent(new CustomEvent('contexts:refresh'))
      showToast({ title: 'Saved', description: 'Context URL updated' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Save failed', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async () => {
    if (!entityId) return
    const id = entityId
    setIsSaving(true)
    try {
      await updateContextUrl(id, url)
      window.dispatchEvent(new CustomEvent('contexts:refresh'))
      showToast({ title: 'Saved', description: 'Context URL updated' })
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
        onBack={closeM2}
        action={
          <button
            type="button"
            onClick={() => openM2('form', entityId)}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        }
      />

      {/* URL editor */}
      <div className="p-3 border-b border-sidebar-border shrink-0">
        <div className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Context URL</div>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="text-xs h-7 font-mono"
            placeholder="workspace://path"
          />
          <Button size="sm" className="h-7 px-2 text-xs shrink-0" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '…' : 'Set'}
          </Button>
        </div>
      </div>

      {/* Pending path confirmation bar */}
      {pendingPath && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
          <span className="flex-1 text-xs text-amber-700 dark:text-amber-400 truncate font-mono">
            {pendingPath}
          </span>
          <button
            type="button"
            onClick={handleConfirmPending}
            disabled={isSaving}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 shrink-0"
          >
            <Check className="w-3 h-3" />
            Set
          </button>
          <button
            type="button"
            onClick={() => setPendingPath(null)}
            className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="text-[10px] text-muted-foreground px-3 pt-2 pb-1 font-medium uppercase tracking-wide shrink-0">
          {context?.workspaceName || 'Workspace'} · context tree
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
