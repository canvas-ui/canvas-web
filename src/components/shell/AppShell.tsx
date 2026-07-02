import { MenuProvider } from './menu-context'
import { MenuBar } from './MenuBar'
import { MenuPanelArea } from './MenuPanelArea'
import { ContentArea } from './ContentArea'
import { ToolboxFab } from './ToolboxFab'
import { AgentSessionProvider } from '@/components/agent/agent-session-context'
import { ToolboxProvider } from '@/components/toolbox/toolbox-context'
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
              {/* Toolbox now docks inside ContentArea as a card, shrinking main content */}
              <ContentArea />
              {/* Slim creation panel — opens beside the main content (workspace or context) */}
              <AddPanel />
            </div>
            {/* Always-visible FAB — fixed to viewport so it survives on small/mobile screens */}
            <ToolboxFab />
          </SideViewProvider>
        </ToolboxProvider>
      </AgentSessionProvider>
    </MenuProvider>
  )
}
