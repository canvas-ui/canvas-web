import { useEffect, useRef, useState } from 'react'
import { Plus, Play, Square, Settings } from 'lucide-react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { moveItem, persistSequentialOrder, useListReorder } from '@/lib/list-order'
import { useMenu } from '@/components/shell/menu-context'
import { useWorkspaceListData } from '@/hooks/useWorkspaceListData'
import { startWorkspace, stopWorkspace, updateWorkspace } from '@/services/workspace'
import { useToast } from '@/components/ui/toast-container'
import { useNavigate } from 'react-router-dom'
import { LayerIconPicker } from '@/components/menu/shared/LayerIconPicker'
import { DEFAULT_WORKSPACE_ICON, type LayerStyle } from '@/lib/layer-style'

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'active' ? 'bg-green-500' :
    status === 'error' ? 'bg-red-500' :
    'bg-gray-400'

  return <span className={cn('inline-block w-2 h-2 rounded-full shrink-0', color)} title={status} />
}

export function WorkspaceList() {
  const { state, selectEntity, openM2, closeM2 } = useMenu()
  const { workspaces, isLoading } = useWorkspaceListData(state.activeSection === 'workspaces')
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [picker, setPicker] = useState<{ x: number; y: number; name: string } | null>(null)
  const [styleOverrides, setStyleOverrides] = useState<Map<string, LayerStyle>>(new Map())
  const persistTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Drag-to-reorder: optimistic order shown until the refetched (sorted) list
  // replaces it. Sequential ints are persisted only for rows that moved.
  const [optimisticOrder, setOptimisticOrder] = useState<Workspace[] | null>(null)
  const orderedWorkspaces = optimisticOrder ?? workspaces
  useEffect(() => { setOptimisticOrder(null) }, [workspaces])
  const { rowProps, overIndex } = useListReorder((from, to) => {
    const next = moveItem(orderedWorkspaces, from, to)
    setOptimisticOrder(next)
    persistSequentialOrder(next, (ws, order) => updateWorkspace(ws.name, { order }))
      .then(() => window.dispatchEvent(new CustomEvent('workspaces:refresh')))
      .catch(err => {
        setOptimisticOrder(null)
        showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Reorder failed', variant: 'destructive' })
      })
  })

  const styleFor = (ws: Workspace): LayerStyle =>
    styleOverrides.get(ws.name) ?? { icon: ws.icon ?? undefined, color: ws.color ?? undefined }

  const handleStyleChange = (name: string, current: LayerStyle, change: LayerStyle) => {
    const next: LayerStyle = { ...current, ...change }
    setStyleOverrides(prev => new Map(prev).set(name, next))
    const timers = persistTimers.current
    const pending = timers.get(name)
    if (pending) clearTimeout(pending)
    timers.set(name, setTimeout(() => {
      timers.delete(name)
      // color is non-nullable server-side; only send it when set.
      const payload: Partial<{ icon: string | null; color: string }> = { icon: next.icon ?? null }
      if (next.color) payload.color = next.color
      updateWorkspace(name, payload)
        .then(() => window.dispatchEvent(new CustomEvent('workspaces:refresh')))
        .catch(err => showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Update failed', variant: 'destructive' }))
    }, 350))
  }

  const handleSelect = (ws: Workspace) => {
    selectEntity(ws.name)
    openM2('detail', ws.name)
  }

  const handleStart = async (e: React.MouseEvent, ws: Workspace) => {
    e.stopPropagation()
    setBusyIds(prev => new Set(prev).add(ws.name))
    try {
      await startWorkspace(ws.name)
      showToast({ title: 'Success', description: `${ws.label || ws.name} started` })
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Start failed', variant: 'destructive' })
    } finally {
      setBusyIds(prev => { const s = new Set(prev); s.delete(ws.name); return s })
    }
  }

  const handleStop = async (e: React.MouseEvent, ws: Workspace) => {
    e.stopPropagation()
    setBusyIds(prev => new Set(prev).add(ws.name))
    try {
      await stopWorkspace(ws.name)
      showToast({ title: 'Success', description: `${ws.label || ws.name} stopped` })
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Stop failed', variant: 'destructive' })
    } finally {
      setBusyIds(prev => { const s = new Set(prev); s.delete(ws.name); return s })
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-sidebar-border shrink-0">
        <span className="text-sm font-semibold">Workspaces</span>
        <button
          type="button"
          onClick={() => openM2('form', null)}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background hover:opacity-80 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && workspaces.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">Loading...</div>
        ) : workspaces.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">No workspaces found</div>
        ) : (
          <div className="space-y-1.5 px-2">
            {orderedWorkspaces.map((ws, index) => {
              const isActive = state.selectedEntityId === ws.name
              const isBusy = busyIds.has(ws.name)
              const isInactive = ws.status !== 'active'
              const style = styleFor(ws)

              return (
                <div
                  key={ws.id || ws.name}
                  {...rowProps(index)}
                  className={cn(
                    'group relative rounded-md px-3 py-2.5 transition-all shadow-sm',
                    isActive
                      ? 'bg-accent shadow cursor-pointer hover:shadow'
                      : isInactive
                        ? 'bg-card opacity-60 cursor-not-allowed'
                        : 'bg-card hover:bg-accent/50 cursor-pointer hover:shadow',
                    overIndex === index && 'ring-2 ring-primary/40',
                  )}
                  style={{ borderRight: `6px solid ${style.color || 'transparent'}`, borderRadius: style.color ? '6px 0 0 6px' : undefined }}
                  onClick={() => { if (!isInactive) handleSelect(ws) }}
                >
                  {/* Top row: label + controls */}
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      title="Change icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPicker({ x: Math.min(e.clientX, window.innerWidth - 290), y: Math.min(e.clientY, window.innerHeight - 360), name: ws.name })
                      }}
                      className="shrink-0 rounded p-0.5 hover:bg-muted-foreground/10"
                    >
                      <Icon
                        icon={style.icon || DEFAULT_WORKSPACE_ICON}
                        width={18}
                        height={18}
                        color={style.color || undefined}
                        className={cn(!style.color && 'text-muted-foreground')}
                      />
                    </button>
                    {/* Left: status + label */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={ws.status} />
                        <span className="text-sm font-medium truncate">
                          {ws.label || ws.name}
                        </span>
                      </div>
                    </div>

                    {/* Right: controls */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {ws.status === 'active' ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) => handleStop(e, ws)}
                          className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted-foreground/10 text-muted-foreground disabled:opacity-50 transition-colors"
                          title="Stop"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) => handleStart(e, ws)}
                          className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted-foreground/10 text-muted-foreground disabled:opacity-50 transition-colors"
                          title="Start"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          selectEntity(ws.name)
                          closeM2()
                          navigate(`/workspaces/${ws.name}/settings`)
                        }}
                        className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted-foreground/10 text-muted-foreground transition-colors"
                        title="Settings"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  {ws.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5 pl-3.5">
                      {ws.description}
                    </div>
                  )}

                  {/* Meta: host + owner */}
                  <div className="flex items-center gap-2 mt-1 pl-3.5">
                    {(ws as any).host && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {(ws as any).host}
                      </span>
                    )}
                    {ws.ownerEmail && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {ws.ownerEmail}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {picker && (() => {
        const ws = workspaces.find(w => w.name === picker.name)
        if (!ws) return null
        const current = styleFor(ws)
        return (
          <LayerIconPicker
            x={picker.x}
            y={picker.y}
            current={current}
            onChange={(change) => handleStyleChange(picker.name, current, change)}
            onClose={() => setPicker(null)}
          />
        )
      })()}
    </div>
  )
}
