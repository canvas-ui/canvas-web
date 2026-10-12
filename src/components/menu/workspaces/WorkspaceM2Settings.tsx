import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { M2Header } from '@/components/menu/shared/M2Header'
import { M2SettingsNav, type M2NavItem } from '@/components/menu/shared/M2SettingsNav'
import { useMenu } from '@/components/shell/use-menu'
import { useIsMobile } from '@/hooks/use-mobile'
import { DEFAULT_WORKSPACE_ICON } from '@/lib/layer-style'
import { WORKSPACE_SETTINGS_SECTIONS, resolveWorkspaceSettingsTab } from '@/lib/settings-sections'
import { getWorkspace } from '@/services/workspace'
import { canManageWorkspace } from '@/lib/workspace-access'

// M2 while /workspaces/:name/settings/* is open: the section list. The content
// area renders exactly one section, so this list is the only tab strip — it
// keeps scaling as settings grow.
export function WorkspaceM2Settings() {
  const { state, closeM2 } = useMenu()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const location = useLocation()
  const wsName = state.selectedEntityId

  const [details, setDetails] = useState<{ address: string; workspace: Workspace } | null>(null)
  const workspace = details?.address === wsName ? details.workspace : null
  const label = workspace?.label || workspace?.name
  const canManage = canManageWorkspace(workspace)

  useEffect(() => {
    if (!wsName) return
    let cancelled = false
    getWorkspace(wsName)
      .then(ws => {
        if (cancelled) return
        setDetails({ address: wsName, workspace: ws })
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
        title={`Settings: ${label || wsName || 'Workspace'}`}
        icon={workspace?.icon || DEFAULT_WORKSPACE_ICON}
        accentColor={workspace?.color}
        onBack={() => {
          // Mobile: the section list is a step INSIDE the drawer (opened without
          // navigating), so back means "up one step" — slide M2 out and land on
          // the workspace list in M1. Navigating instead would close the whole
          // drawer and open the workspace, which is an exit, not a back.
          if (isMobile || !wsName) closeM2()
          else navigate(`/workspaces/${wsName}`)
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
      {canManage ? <M2SettingsNav
        items={items}
        activeId={activeTab}
        onSelect={id => wsName && navigate(`/workspaces/${wsName}/settings/${id}`)}
      /> : <p className="p-4 text-sm text-muted-foreground">{workspace ? 'Workspace settings are available to owners and admins.' : 'Loading workspace…'}</p>}
    </div>
  )
}
