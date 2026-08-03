import { useEffect, useState } from 'react'
import { Plus, Settings, Link2, GripVertical } from 'lucide-react'
import { Icon } from '@iconify/react'
import { visibleAccentColor, onAccentTextClass } from '@/utils/color'
import { DEFAULT_WORKSPACE_ICON } from '@/lib/layer-style'
import { cn } from '@/lib/utils'
import { useMenu } from '@/components/shell/menu-context'
import { useContextListData } from '@/hooks/useContextListData'
import { updateContext } from '@/services/context'
import { moveItem, persistSequentialOrder, useListReorder } from '@/lib/list-order'
import { useToast } from '@/components/ui/toast-container'
import { useNavigate } from 'react-router-dom'

export function ContextList() {
  const { state, selectEntity, openM2 } = useMenu()
  const { contexts, isLoading } = useContextListData(state.activeSection === 'contexts')
  const { showToast } = useToast()
  const navigate = useNavigate()

  // Drag-to-reorder (own contexts only — shared rows aren't writable and keep
  // their unordered sort-last position).
  const [optimisticOrder, setOptimisticOrder] = useState<Context[] | null>(null)
  const orderedContexts = optimisticOrder ?? contexts
  useEffect(() => { setOptimisticOrder(null) }, [contexts])
  const isSharedCtx = (ctx: Context & Record<string, any>) => ctx.isShared === true || ctx.type === 'shared'
  const { rowProps, handleProps, draggingIndex, insertLineClass } = useListReorder((from, to) => {
    const next = moveItem(orderedContexts, from, to)
    setOptimisticOrder(next)
    persistSequentialOrder(next, (ctx, order) =>
      isSharedCtx(ctx) ? Promise.resolve() : updateContext(ctx.id, { order }))
      .then(({ failed }) => {
        window.dispatchEvent(new CustomEvent('contexts:refresh'))
        if (failed) showToast({ title: 'Partial reorder', description: `${failed} context(s) could not be reordered`, variant: 'destructive' })
      })
  })

  const handleSelect = (ctx: Context & Record<string, any>) => {
    selectEntity(ctx.id)
    navigate(`/contexts/${ctx.id}`)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
        <span className="text-sm font-semibold">Contexts</span>
        <button
          type="button"
          onClick={() => openM2('form', null)}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background hover:opacity-80 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && contexts.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">Loading...</div>
        ) : contexts.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">No contexts found</div>
        ) : (
          <div className="space-y-1.5 px-2">
            {orderedContexts.map((ctx, index) => {
              const isActive = state.selectedEntityId === ctx.id
              const isShared = isSharedCtx(ctx)
              const isWorkspaceActive = ctx.workspaceActive !== false
              const accent = visibleAccentColor(ctx.color)

              return (
                <div
                  key={`${ctx.userId || 'u'}-${ctx.id}`}
                  {...rowProps(index)}
                  className={cn(
                    'group relative rounded-md py-2.5 pl-3 pr-7 transition-all shadow-elevation-1',
                    isWorkspaceActive
                      ? 'cursor-pointer hover:shadow ' + (isActive ? 'bg-accent shadow' : 'bg-card hover:bg-accent/50')
                      : 'cursor-not-allowed opacity-50 bg-card',
                    insertLineClass(index, orderedContexts.length),
                    draggingIndex === index && 'opacity-60',
                  )}
                  onClick={() => isWorkspaceActive && handleSelect(ctx)}
                  title={isWorkspaceActive ? undefined : `Workspace "${ctx.workspaceName}" is not active`}
                >
                  {/* The color strip IS the drag handle; shared contexts keep
                      the strip as a passive color cue (not reorderable). */}
                  {isShared ? (
                    <div
                      className={cn('absolute inset-y-0 right-0 w-4 rounded-r-md', !accent && 'bg-muted')}
                      style={accent ? { backgroundColor: accent } : undefined}
                    />
                  ) : (
                    <button
                      type="button"
                      {...handleProps(index)}
                      title="Drag to reorder"
                      aria-label="Drag to reorder"
                      className={cn(
                        'absolute inset-y-0 right-0 flex w-4 cursor-grab items-center justify-center rounded-r-md active:cursor-grabbing',
                        !accent && 'bg-muted',
                      )}
                      style={accent ? { backgroundColor: accent } : undefined}
                    >
                      <GripVertical className={cn('h-3.5 w-3.5', onAccentTextClass(accent))} />
                    </button>
                  )}
                  <div className="flex items-start gap-2">
                    {/* Icon derived server-side from the bound path's layer, falling back to the workspace style */}
                    <Icon
                      icon={ctx.icon || DEFAULT_WORKSPACE_ICON}
                      width={16}
                      height={16}
                      color={accent}
                      className={cn('mt-0.5 shrink-0', !accent && 'text-muted-foreground')}
                    />
                    <span className="text-sm font-medium truncate flex-1">{ctx.name || ctx.id}</span>
                    {isShared && (
                      <span className="rounded-full bg-info/10 px-1.5 py-0.5 text-[9px] text-info shrink-0">
                        Shared
                      </span>
                    )}
                    {isWorkspaceActive && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          selectEntity(ctx.id)
                          openM2('detail', ctx.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                        title="Switch context URL"
                      >
                        <Link2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        selectEntity(ctx.id)
                        openM2('form', ctx.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                      title="Settings"
                    >
                      <Settings className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>

                  {ctx.name && (
                    <div className="text-[10px] text-muted-foreground/60 truncate font-mono">
                      {ctx.id}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {ctx.url || '/'}
                  </div>

                  {ctx.ownerEmail && (
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {ctx.ownerEmail}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
