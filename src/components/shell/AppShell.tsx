import { MenuProvider } from './menu-context'
import { MenuBar } from './MenuBar'
import { MenuPanelArea } from './MenuPanelArea'
import { ContentArea } from './ContentArea'
import { ToolBar } from './ToolBar'
import { AgentSessionProvider } from '@/components/agent/agent-session-context'
import { ToolboxProvider } from '@/components/toolbox/toolbox-context'
import { ToolboxPanel } from '@/components/toolbox/ToolboxPanel'

export function AppShell() {
  return (
    <MenuProvider>
      <AgentSessionProvider>
        <ToolboxProvider>
          <div className="flex h-screen w-screen overflow-hidden bg-background">
            <MenuBar />
            <MenuPanelArea />
            <ContentArea />
            <ToolboxPanel />
            <ToolBar />
          </div>
        </ToolboxProvider>
      </AgentSessionProvider>
    </MenuProvider>
  )
}
