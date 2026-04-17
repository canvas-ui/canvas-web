import { cn } from '@/lib/utils'
import { useMenu } from './menu-context'
import { ContextList } from '@/components/menu/contexts/ContextList'
import { WorkspaceList } from '@/components/menu/workspaces/WorkspaceList'
import { AgentList } from '@/components/menu/agents/AgentList'
import { AdminMenu } from '@/components/menu/admin/AdminMenu'
import { SettingsMenu } from '@/components/menu/settings/SettingsMenu'

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

      {/* M2 layer — Phase 3 */}
      <div
        className={cn(
          'absolute inset-0 z-10 bg-sidebar transition-transform duration-200 ease-out',
          state.m2Open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* M2 content will be rendered here in Phase 3 */}
      </div>
    </div>
  )
}
