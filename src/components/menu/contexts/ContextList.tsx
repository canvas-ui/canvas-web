import { useNavigate } from 'react-router-dom'
import { Plus, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMenu } from '@/components/shell/menu-context'
import { useContextListData } from '@/hooks/useContextListData'

export function ContextList() {
  const navigate = useNavigate()
  const { state, selectEntity } = useMenu()
  const { contexts, isLoading } = useContextListData(state.activeSection === 'contexts')

  const handleSelect = (ctx: Context & Record<string, any>) => {
    const isShared = ctx.isShared === true || ctx.type === 'shared'
    const path = isShared
      ? `/contexts/${ctx.id}?ownerId=${encodeURIComponent(ctx.userId)}`
      : `/contexts/${ctx.id}`
    selectEntity(ctx.id)
    navigate(path)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-sidebar-border shrink-0">
        <span className="text-sm font-semibold">Contexts</span>
        <button
          type="button"
          onClick={() => navigate('/contexts')}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background hover:opacity-80 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && contexts.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">Loading...</div>
        ) : contexts.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">No contexts found</div>
        ) : (
          <div className="space-y-1.5 px-2">
            {contexts.map((ctx) => {
              const isActive = state.selectedEntityId === ctx.id
              const isShared = (ctx as any).isShared === true || (ctx as any).type === 'shared'

              return (
                <div
                  key={`${ctx.userId || 'u'}-${ctx.id}`}
                  className={cn(
                    'group relative rounded-l-md px-3 py-2.5 cursor-pointer transition-all shadow-sm hover:shadow',
                    isActive ? 'bg-accent shadow' : 'bg-card hover:bg-accent/50',
                  )}
                  style={{ borderRight: `6px solid ${ctx.color || 'transparent'}` }}
                  onClick={() => handleSelect(ctx)}
                >
                  {/* Header row: Context ID + badges + settings */}
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium truncate flex-1">{ctx.id}</span>
                    {isShared && (
                      <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] text-blue-700 shrink-0">
                        Shared
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        selectEntity(ctx.id)
                        const isSharedCtx = (ctx as any).isShared === true || (ctx as any).type === 'shared'
                        const base = `/contexts/${ctx.id}/settings`
                        const params = isSharedCtx ? `?ownerId=${encodeURIComponent(ctx.userId)}` : ''
                        navigate(`${base}${params}`)
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                    >
                      <Settings className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>

                  {/* URL */}
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {ctx.url || '/'}
                  </div>

                  {/* Owner email */}
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
