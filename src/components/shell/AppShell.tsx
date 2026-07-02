import { MenuProvider } from './menu-context'
import { MenuBar } from './MenuBar'
import { MenuPanelArea } from './MenuPanelArea'
import { ContentArea } from './ContentArea'
import { ToolBar } from './ToolBar'
import { AgentSessionProvider } from '@/components/agent/agent-session-context'
import { ToolboxProvider } from '@/components/toolbox/toolbox-context'
import { ToolboxPanel } from '@/components/toolbox/ToolboxPanel'
import { AddPanel } from '@/components/toolbox/AddPanel'
import { SideViewProvider } from './side-view-context'

export function AppShell() {
  return (
    <MenuProvider>
      <AgentSessionProvider>
        <ToolboxProvider>
          <SideViewProvider>
            <div className="flex h-screen w-screen overflow-hidden canvas-desk gap-2 p-2">
              <MenuBar />
              <MenuPanelArea />
              <ContentArea />
              {/* Slim creation panel — opens beside the main content (workspace or context) */}
              <AddPanel />
              {/* Toolbox dock — T1 grows the same dark sheet rather than spawning a new one */}
              <div className="dark flex shrink-0 rounded-xl shadow-elevation-3 overflow-hidden bg-zinc-900">
                <ToolboxPanel />
                <ToolBar />
              </div>
            </div>
          </SideViewProvider>
        </ToolboxProvider>
      </AgentSessionProvider>
    </MenuProvider>
  )
}
