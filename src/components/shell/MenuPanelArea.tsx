import { cn } from '@/lib/utils'
import { useMenu } from './menu-context'
import { ContextList } from '@/components/menu/contexts/ContextList'
import { ContextM2Detail } from '@/components/menu/contexts/ContextM2Detail'
import { ContextM2Form } from '@/components/menu/contexts/ContextM2Form'
import { WorkspaceList } from '@/components/menu/workspaces/WorkspaceList'
import { WorkspaceM2 } from '@/components/menu/workspaces/WorkspaceM2'
import { WorkspaceM2Form } from '@/components/menu/workspaces/WorkspaceM2Form'
import { AgentList } from '@/components/menu/agents/AgentList'
import { AgentM2Chat } from '@/components/menu/agents/AgentM2Chat'
import { AgentM2Settings } from '@/components/menu/agents/AgentM2Settings'
import { AdminMenu } from '@/components/menu/admin/AdminMenu'
import { SettingsMenu } from '@/components/menu/settings/SettingsMenu'

function M2Content() {
  const { state } = useMenu()
  const { activeSection, m2View } = state

  if (activeSection === 'contexts') {
    if (m2View === 'detail') return <ContextM2Detail />
    if (m2View === 'form') return <ContextM2Form />
  }
  if (activeSection === 'workspaces') {
    if (m2View === 'detail') return <WorkspaceM2 />
    if (m2View === 'form') return <WorkspaceM2Form />
  }
  if (activeSection === 'agents') {
    if (m2View === 'chat') return <AgentM2Chat />
    if (m2View === 'form' || m2View === 'settings') return <AgentM2Settings />
  }
  return null
}

export function MenuPanelArea() {
  const { state } = useMenu()

  return (
    <div
      className={cn(
        'relative flex-shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out',
        state.m1Open ? 'w-[var(--m1-width)]' : 'w-0 border-r-0',
      )}
    >
      {/* M1 layer */}
      <div className="absolute inset-0 flex flex-col min-w-[var(--m1-width)]">
        {state.activeSection === 'contexts' && <ContextList />}
        {state.activeSection === 'workspaces' && <WorkspaceList />}
        {state.activeSection === 'agents' && <AgentList />}
        {state.activeSection === 'admin' && <AdminMenu />}
        {state.activeSection === 'settings' && <SettingsMenu />}
      </div>

      {/* M2 layer — slides over M1 */}
      <div
        className={cn(
          'absolute inset-0 z-10 bg-sidebar flex flex-col transition-transform duration-200 ease-out',
          state.m2Open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {state.m2Open && <M2Content />}
      </div>
    </div>
  )
}
