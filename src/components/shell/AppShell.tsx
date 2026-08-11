import { MenuProvider } from './menu-context'
import { MenuBar, MobileMenuToggle } from './MenuBar'
import { MenuPanelArea } from './MenuPanelArea'
import { ContentArea } from './ContentArea'
import { ToolboxFab } from './ToolboxFab'
import { AgentSessionProvider } from '@/components/agent/agent-session-context'
import { ToolboxProvider } from '@/components/toolbox/toolbox-context'
import { AddPanel } from '@/components/toolbox/AddPanel'
import { ToolboxPanel } from '@/components/toolbox/ToolboxPanel'
import { LensFeedProvider } from '@/components/toolbox/lens-feed-context'
import { LensFeedWidget } from '@/components/toolbox/LensFeedWidget'
import { SideViewProvider } from './side-view-context'
import { DocumentModalProvider } from './document-modal-context'

export function AppShell() {
  return (
    <MenuProvider>
      <AgentSessionProvider>
        <ToolboxProvider>
          {/* Above the toolbox on purpose: the Lens camera has to outlive the
              panel that started it (closing the toolbox unmounts that panel,
              and on mobile closing it is the only way to see the results). */}
          <LensFeedProvider>
          <SideViewProvider>
            <DocumentModalProvider>
            {/* h-viewport (not h-screen) so the shell tracks the real visible height
                when mobile browser chrome expands/collapses */}
            <div className="flex h-viewport w-full overflow-hidden surface-desk gap-shell p-shell">
              <MenuBar />
              <MenuPanelArea />
              {/* Toolbox now docks inside ContentArea as a card, shrinking main content */}
              <ContentArea />
              {/* Slim creation panel — opens beside the main content (workspace or context) */}
              <AddPanel />
              {/* Toolbox (Filters/Agents/Notifications) — its own card, pinned as the
                  last sibling so it is ALWAYS the right-most element on screen. */}
              <ToolboxPanel />
            </div>
            {/* Desktop-only FAB — on mobile the toolbox entry lives in the M0
                rail, toggled by the bottom-left menu button */}
            <ToolboxFab />
            <MobileMenuToggle />
            {/* A running feed with no panel showing it collapses to here. */}
            <LensFeedWidget />
            </DocumentModalProvider>
          </SideViewProvider>
          </LensFeedProvider>
        </ToolboxProvider>
      </AgentSessionProvider>
    </MenuProvider>
  )
}
