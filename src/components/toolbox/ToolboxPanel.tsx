import { useRef, useState, useCallback } from 'react'
import { useToolbox } from './toolbox-context'
import { HomePanel } from './panels/HomePanel'
import { ToolsPanel } from './panels/ToolsPanel'
import { AgentsPanel } from './panels/AgentsPanel'
import { AgentChatPanel } from './panels/AgentChatPanel'

const DEFAULT_WIDTH = 500
const MIN_WIDTH = 280
const MAX_WIDTH = 900

export function ToolboxPanel() {
  const { state, closeT1, closeT2 } = useToolbox()
  const { t1Open, t1View, t2Open, t2AgentId } = state
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startWidth: width }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startX - ev.clientX
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + delta))
      setWidth(next)
    }

    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [width])

  if (!t1Open || !t1View) return null

  return (
    <div
      style={{ width }}
      className="relative flex flex-col h-full bg-background text-foreground shrink-0 overflow-hidden border-r border-border"
    >
      {/* Drag handle — left edge */}
      <div
        onMouseDown={onDragStart}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors z-10"
      />

      {/* T1 — panel layer */}
      <div className="absolute inset-0 flex flex-col">
        {t1View === 'home' && <HomePanel onClose={closeT1} />}
        {t1View === 'tools' && <ToolsPanel onClose={closeT1} />}
        {t1View === 'agents' && <AgentsPanel onClose={closeT1} />}
      </div>

      {/* T2 — agent chat overlay */}
      {t2Open && t2AgentId && (
        <div className="absolute inset-0 z-10 bg-background flex flex-col">
          <AgentChatPanel agentId={t2AgentId} onClose={closeT2} />
        </div>
      )}
    </div>
  )
}
