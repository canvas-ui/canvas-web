import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { M2Header } from '@/components/menu/shared/M2Header'
import { M2SettingsNav, type M2NavItem } from '@/components/menu/shared/M2SettingsNav'
import { useMenu } from '@/components/shell/menu-context-data'
import { AGENT_SETTINGS_SECTIONS, resolveAgentSettingsTab } from '@/lib/settings-sections'
import { getAgent, type Agent } from '@/services/agent'

// Mirrors WorkspaceM2Settings exactly: M2 lists the sections, the content area
// renders one. Agent and workspace settings are the same UX by construction.
export function AgentM2Settings() {
  const { state, closeM2 } = useMenu()
  const navigate = useNavigate()
  const location = useLocation()
  const entityId = state.selectedEntityId

  const [agent, setAgent] = useState<Agent | null>(null)

  useEffect(() => {
    if (!entityId) return
    let cancelled = false
    getAgent(entityId).then(a => { if (!cancelled) setAgent(a) }).catch(() => {})
    return () => { cancelled = true }
  }, [entityId])

  // Read from the pathname — this renders inside the shell layout route, which
  // carries no :tab param of its own. Null until a section is actually open.
  const segments = location.pathname.split('/').filter(Boolean)
  const activeTab = segments[2] === 'settings' ? resolveAgentSettingsTab(segments[3]) : null
  const routeAgentId = encodeURIComponent(agent?.name || entityId || '')

  const items: M2NavItem[] = useMemo(
    () => AGENT_SETTINGS_SECTIONS.map(({ id, label, description, icon: SectionIcon }) => ({
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
        title={`Settings — ${agent?.label || agent?.name || entityId || 'Agent'}`}
        accentColor={agent?.color ?? null}
        onBack={() => {
          if (routeAgentId) navigate(`/agents/${routeAgentId}`)
          else closeM2()
        }}
        action={
          <button
            type="button"
            onClick={() => routeAgentId && navigate(`/agents/${routeAgentId}`)}
            className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            title="Open agent"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        }
      />
      <M2SettingsNav
        items={items}
        activeId={activeTab}
        onSelect={id => routeAgentId && navigate(`/agents/${routeAgentId}/settings/${id}`)}
      />
    </div>
  )
}
