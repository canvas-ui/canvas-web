import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { M2Header } from '@/components/menu/shared/M2Header'
import { M2SettingsNav, type M2NavItem } from '@/components/menu/shared/M2SettingsNav'
import { useMenu } from '@/components/shell/menu-context'
import { DEFAULT_WORKSPACE_ICON } from '@/lib/layer-style'
import { CONTEXT_SETTINGS_SECTIONS, resolveContextSettingsTab } from '@/lib/settings-sections'
import { getContext } from '@/services/context'

// Same shape as WorkspaceM2Settings and AgentM2Settings: M2 lists the
// sections, the content area renders one.
export function ContextM2Settings() {
  const { state, closeM2 } = useMenu()
  const navigate = useNavigate()
  const location = useLocation()
  const entityId = state.selectedEntityId

  const [context, setContext] = useState<Context | null>(null)

  useEffect(() => {
    if (!entityId) return
    let cancelled = false
    getContext(entityId).then(ctx => { if (!cancelled) setContext(ctx) }).catch(() => {})
    return () => { cancelled = true }
  }, [entityId])

  // Read from the pathname — this renders inside the shell layout route, which
  // carries no :tab param of its own.
  const activeTab = resolveContextSettingsTab(location.pathname.split('/').filter(Boolean)[3])
  const backPath = entityId ? `/contexts/${entityId}` : null

  const items: M2NavItem[] = useMemo(
    () => CONTEXT_SETTINGS_SECTIONS.map(({ id, label, description, icon: SectionIcon }) => ({
      id,
      label,
      description,
      icon: <SectionIcon className="h-4 w-4" />,
    })),
    [],
  )

  return (
    <div className="flex h-full flex-col">
      <M2Header
        title={`Settings — ${context?.name || entityId || 'Context'}`}
        icon={context?.icon || DEFAULT_WORKSPACE_ICON}
        accentColor={context?.color ?? null}
        onBack={() => (backPath ? navigate(backPath) : closeM2())}
        action={
          <button
            type="button"
            onClick={() => backPath && navigate(backPath)}
            className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            title="Open context"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        }
      />
      <M2SettingsNav
        items={items}
        activeId={activeTab}
        onSelect={id => entityId && navigate(`/contexts/${entityId}/settings/${id}`)}
      />
    </div>
  )
}
