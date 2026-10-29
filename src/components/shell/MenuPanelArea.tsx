import { AppsMenu } from '@/components/menu/apps/AppsMenu'
import { MenuResizeHandle } from './MenuResizeHandle'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useMenu } from './use-menu'
import { useMobileViewSlide } from '@/hooks/use-mobile-view-slide'
import { ContextList } from '@/components/menu/contexts/ContextList'
import { ContextM2Detail } from '@/components/menu/contexts/ContextM2Detail'
import { ContextM2Settings } from '@/components/menu/contexts/ContextM2Settings'
import { WorkspaceList } from '@/components/menu/workspaces/WorkspaceList'
import { WorkspaceM2 } from '@/components/menu/workspaces/WorkspaceM2'
import { WorkspaceM2Settings } from '@/components/menu/workspaces/WorkspaceM2Settings'
import { AgentList } from '@/components/menu/agents/AgentList'
import { AgentM2Sessions } from '@/components/menu/agents/AgentM2Sessions'
import { AgentM2Settings } from '@/components/menu/agents/AgentM2Settings'
import { AdminMenu } from '@/components/menu/admin/AdminMenu'
import { SettingsMenu } from '@/components/menu/settings/SettingsMenu'

const DEFAULT_WIDTH = 280

// Exported: the strip layout renders the same M2 surface as its own column.
export function M2Content() {
  const { state } = useMenu()
  const { activeSection, m2View } = state

  if (activeSection === 'contexts') {
    if (m2View === 'settings') return <ContextM2Settings />
    if (m2View === 'detail') return <ContextM2Detail />
  }
  if (activeSection === 'workspaces') {
    if (m2View === 'settings') return <WorkspaceM2Settings />
    if (m2View === 'detail') return <WorkspaceM2 />
  }
  if (activeSection === 'agents') {
    if (m2View === 'settings') return <AgentM2Settings />
    if (m2View === 'detail') return <AgentM2Sessions />
  }
  return null
}

export function MenuPanelArea() {
  const { state, closeM1, closeM2 } = useMenu()
  // Esc closes the menu layers innermost-first: M2 drawer, then M1 panel.
  // Registration order (M1 hook first) keeps M2 topmost when both open at once.
  useEscapeClose(closeM1, state.m1Open && !state.m2Open)
  useEscapeClose(closeM2, state.m1Open && state.m2Open)
  const isMobile = useIsMobile()
  const m1Ref = useRef<HTMLDivElement>(null)
  const m2Ref = useRef<HTMLDivElement>(null)
  useMobileViewSlide(m1Ref, state.m1Open && !state.m2Open, state.activeSection ?? '')
  useMobileViewSlide(m2Ref, state.m1Open && state.m2Open, `${state.activeSection}:${state.selectedEntityId}:${state.m2View}`)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const mobileOverlay = isMobile && state.m1Open

  return (
    <>
      {/* Mobile: the drawer floats over the content, so dim it and let a tap
          outside close the menu (the URL sync also closes it on navigation). */}
      {mobileOverlay && (
        <div className="fixed inset-0 z-40 bg-scrim animate-fade-in" onClick={closeM1} aria-hidden />
      )}
      <div
        style={state.m1Open && !mobileOverlay ? { width } : undefined}
        className={cn(
          'flex-shrink-0 overflow-hidden bg-card surface-glass',
          !isDragging && !mobileOverlay && 'transition-[width] duration-normal ease-out',
          state.m1Open ? 'rounded-[var(--panel-radius)] shadow-elevation-2' : 'w-0',
          mobileOverlay
            // Left offset is derived, not hardcoded: the rail is 2.75/3/3.5rem
            // depending on density, so a fixed `left-16` closed the gap to zero
            // at comfortable density. inset + rail + gap.
            ? 'fixed bottom-2 left-[calc(0.5rem+var(--spacing-rail)+0.5rem)] right-2 top-2 z-40 shadow-elevation-5'
            : 'relative',
        )}
      >
        {/* M1 layer — fades out while M2 slides over it: with translucent
            themes (frost) M2 no longer occludes, so M1 must yield itself. */}
        <div
          ref={m1Ref}
          data-menu-view="list"
          inert={!state.m1Open || state.m2Open}
          className={cn(
            'absolute inset-0 flex flex-col transition-opacity duration-normal ease-out',
            state.m2Open && 'opacity-0 pointer-events-none',
          )}
          style={mobileOverlay ? undefined : { minWidth: width }}
        >
          {state.activeSection === 'contexts' && <ContextList />}
          {state.activeSection === 'workspaces' && <WorkspaceList />}
          {state.activeSection === 'agents' && <AgentList />}
          {state.activeSection === 'admin' && <AdminMenu />}
          {state.activeSection === 'apps' && <AppsMenu />}
          {state.activeSection === 'settings' && <SettingsMenu />}
        </div>

        {/* M2 layer — slides over M1 */}
        <div
          ref={m2Ref}
          data-menu-view="detail"
          inert={!state.m1Open || !state.m2Open}
          className={cn(
            'absolute inset-0 z-10 bg-card flex flex-col md:transition-transform md:duration-normal md:ease-out',
            state.m2Open ? 'translate-x-0' : 'translate-x-full max-md:invisible',
          )}
        >
          {state.m2Open && <M2Content />}

        </div>

        {/* Resize the right edge of either menu with mouse, pen or touch */}
        {state.m1Open && !mobileOverlay && (
          <MenuResizeHandle width={width} onResize={setWidth} onDragging={setIsDragging} />
        )}
      </div>
    </>
  )
}
