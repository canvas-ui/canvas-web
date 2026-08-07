import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { M2Header } from '@/components/menu/shared/M2Header'
import { M2SettingsNav, type M2NavItem } from '@/components/menu/shared/M2SettingsNav'
import { useMenu } from '@/components/shell/menu-context'
import { DEFAULT_WORKSPACE_ICON } from '@/lib/layer-style'
import { WORKSPACE_SETTINGS_SECTIONS, resolveWorkspaceSettingsTab } from '@/lib/settings-sections'
import { getWorkspace } from '@/services/workspace'

// M2 while /workspaces/:name/settings/* is open: the section list. The content
// area renders exactly one section, so this list is the only tab strip — it
// keeps scaling as settings grow.
export function WorkspaceM2Settings() {
  const { state, closeM2 } = useMenu()
  const navigate = useNavigate()
  const location = useLocation()
  const wsName = state.selectedEntityId

  const [label, setLabel] = useState<string | null>(null)
  const [style, setStyle] = useState<{ icon: string | null; color: string | null }>({ icon: null, color: null })

  useEffect(() => {
    if (!wsName) return
    let cancelled = false
    getWorkspace(wsName)
      .then(ws => {
        if (cancelled) return
        setLabel(ws.label || null)
        setStyle({ icon: ws.icon ?? null, color: ws.color ?? null })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [wsName])

  // The tab lives in the URL, not in component state: the settings page owns
  // it and M2 only mirrors it. Read from the pathname rather than useParams —
  // this renders inside the shell layout route, which has no :tab param.
  // Null while the list is open WITHOUT a section chosen (the mobile step),
  // so nothing is highlighted before the user has picked anything.
  const segments = location.pathname.split('/').filter(Boolean)
  const activeTab = segments[2] === 'settings' ? resolveWorkspaceSettingsTab(segments[3]) : null

  const items: M2NavItem[] = useMemo(
    () => WORKSPACE_SETTINGS_SECTIONS.map(({ id, label: sectionLabel, description, icon: SectionIcon }) => ({
      id,
      label: sectionLabel,
      description,
      icon: <SectionIcon className="h-4 w-4" />,
    })),
    [],
  )

  return (
    <div className="flex h-full flex-col">
      <M2Header
        title={`Settings — ${label || wsName || 'Workspace'}`}
        icon={style.icon || DEFAULT_WORKSPACE_ICON}
        accentColor={style.color}
        onBack={() => {
          if (wsName) navigate(`/workspaces/${wsName}`)
          else closeM2()
        }}
        action={
          <button
            type="button"
            onClick={() => wsName && navigate(`/workspaces/${wsName}`)}
            className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            title="Open workspace"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        }
      />
      <M2SettingsNav
        items={items}
        activeId={activeTab}
        onSelect={id => wsName && navigate(`/workspaces/${wsName}/settings/${id}`)}
      />
    </div>
  )
}
