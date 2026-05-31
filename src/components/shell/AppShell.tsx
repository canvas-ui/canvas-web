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
          <div className="flex h-screen w-screen overflow-hidden canvas-desk gap-2 p-2">
            <MenuBar />
            <MenuPanelArea />
            <ContentArea />
            {/* Toolbox dock — T1 grows the same dark sheet rather than spawning a new one */}
            <div className="dark flex shrink-0 rounded-xl shadow-elevation-3 overflow-hidden bg-zinc-900">
              <ToolboxPanel />
              <ToolBar />
            </div>
          </div>
        </ToolboxProvider>
      </AgentSessionProvider>
    </MenuProvider>
  )
}
