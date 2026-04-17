import { MenuProvider } from './menu-context'
import { MenuBar } from './MenuBar'
import { MenuPanelArea } from './MenuPanelArea'
import { ContentArea } from './ContentArea'
import { ToolBar } from './ToolBar'

export function AppShell() {
  return (
    <MenuProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        <MenuBar />
        <MenuPanelArea />
        <ContentArea />
        <ToolBar />
      </div>
    </MenuProvider>
  )
}
