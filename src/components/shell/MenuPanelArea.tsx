import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useMenu } from './menu-context'
import { ContextList } from '@/components/menu/contexts/ContextList'
import { ContextM2Detail } from '@/components/menu/contexts/ContextM2Detail'
import { ContextM2Form } from '@/components/menu/contexts/ContextM2Form'
import { WorkspaceList } from '@/components/menu/workspaces/WorkspaceList'
import { WorkspaceM2 } from '@/components/menu/workspaces/WorkspaceM2'
import { WorkspaceM2Form } from '@/components/menu/workspaces/WorkspaceM2Form'
import { AgentList } from '@/components/menu/agents/AgentList'
import { AgentM2Sessions } from '@/components/menu/agents/AgentM2Sessions'
import { AgentM2Settings } from '@/components/menu/agents/AgentM2Settings'
import { AdminMenu } from '@/components/menu/admin/AdminMenu'
import { SettingsMenu } from '@/components/menu/settings/SettingsMenu'

const DEFAULT_WIDTH = 280
const MIN_WIDTH = 220
const MAX_WIDTH = 560

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
    if (m2View === 'detail') return <AgentM2Sessions />
    if (m2View === 'form' || m2View === 'settings') return <AgentM2Settings />
  }
  return null
}

export function MenuPanelArea() {
  const { state, closeM1 } = useMenu()
  const isMobile = useIsMobile()
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragRef.current = { startX: e.clientX, startWidth: width }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = ev.clientX - dragRef.current.startX
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + delta))
      setWidth(next)
    }

    const onUp = () => {
      dragRef.current = null
      setIsDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [width])

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
          'flex-shrink-0 overflow-hidden bg-card',
          !isDragging && !mobileOverlay && 'transition-[width] duration-200 ease-out',
          state.m1Open ? 'rounded-xl shadow-elevation-2' : 'w-0',
          mobileOverlay
            ? 'fixed bottom-2 left-16 right-2 top-2 z-40 shadow-elevation-5 animate-fade-in'
            : 'relative',
        )}
      >
        {/* M1 layer */}
        <div className="absolute inset-0 flex flex-col" style={mobileOverlay ? undefined : { minWidth: width }}>
          {state.activeSection === 'contexts' && <ContextList />}
          {state.activeSection === 'workspaces' && <WorkspaceList />}
          {state.activeSection === 'agents' && <AgentList />}
          {state.activeSection === 'admin' && <AdminMenu />}
          {state.activeSection === 'settings' && <SettingsMenu />}
        </div>

        {/* M2 layer — slides over M1 */}
        <div
          className={cn(
            'absolute inset-0 z-10 bg-card flex flex-col transition-transform duration-200 ease-out',
            state.m2Open ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          {state.m2Open && <M2Content />}

        </div>

        {/* Drag handle — right edge for both M1 and M2 (pointer devices only) */}
        {state.m1Open && !mobileOverlay && (
          <div
            onMouseDown={onDragStart}
            className="absolute right-0 top-0 bottom-0 z-20 w-1 cursor-col-resize hover:bg-primary/20 transition-colors"
          />
        )}
      </div>
    </>
  )
}
