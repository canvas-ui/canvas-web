import { useCallback, useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, Brain, Bell, X, Maximize2, Minimize2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useToolbox, type T1View } from './toolbox-context'
import { HomePanel } from './panels/HomePanel'
import { ToolsPanel } from './panels/ToolsPanel'
import { AgentsPanel } from './panels/AgentsPanel'
import { NotificationsPanel } from './panels/NotificationsPanel'
import { AgentChatPanel } from './panels/AgentChatPanel'

const TABS: Array<{ view: Exclude<T1View, null>; icon: LucideIcon; label: string }> = [
  { view: 'tools', icon: SlidersHorizontal, label: 'Filters' },
  { view: 'agents', icon: Brain, label: 'Agents' },
  { view: 'notifications', icon: Bell, label: 'Notifications' },
]

// Desktop width bounds. The panel is resizable (drag the left edge) and can be
// toggled to fill ~half the screen — roomy enough for the map filter.
const DEFAULT_WIDTH = 420
const MIN_WIDTH = 340
const WIDTH_KEY = 'toolbox:width'
const clampWidth = (w: number) => {
  const max = typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.7) : 1200
  return Math.max(MIN_WIDTH, Math.min(w, max))
}
const halfScreen = () => (typeof window !== 'undefined' ? Math.round(window.innerWidth / 2) : 720)

// The toolbox as a card — same "paper" chrome as B5Card/DocumentSideCard, so
// it sits inline as a flex sibling of the main content (shrinking it) rather
// than the old fixed dark rail docked outside ContentArea. Resizable + wide
// toggle on desktop; full-bleed on mobile (the parent handles the overlay).
export function ToolboxPanel() {
  const { state, setView, closeT1, closeT2 } = useToolbox()
  const { t1Open, t1View, t2Open, t2AgentId, activeAccentColor } = state
  const isMobile = useIsMobile()

  const [width, setWidth] = useState<number>(() => {
    const raw = typeof window !== 'undefined' ? Number(localStorage.getItem(WIDTH_KEY)) : NaN
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WIDTH
  })

  const persistWidth = useCallback((w: number) => {
    setWidth(w)
    try { localStorage.setItem(WIDTH_KEY, String(w)) } catch { /* ignore */ }
  }, [])

  // Drag the left edge to resize (delta inverted — the handle sits on the far
  // side from the content the panel is docked against).
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startWidth: width }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const next = clampWidth(dragRef.current.startWidth - (ev.clientX - dragRef.current.startX))
      setWidth(next)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // Persist the final width (read off the live state via the setter).
      setWidth((w) => { try { localStorage.setItem(WIDTH_KEY, String(w)) } catch { /* ignore */ } return w })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [width])

  const isWide = width >= halfScreen() * 0.9
  const toggleWide = () => persistWidth(isWide ? DEFAULT_WIDTH : clampWidth(halfScreen()))

  // Keep the width within the viewport when it shrinks.
  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (!t1Open || !t1View) return null

  return (
    <>
      {/* Mobile scrim — same treatment as the AddPanel / M1-M2 drawers. */}
      {isMobile && (
        <div className="fixed inset-0 z-[54] bg-black/30 animate-fade-in" onClick={closeT1} aria-hidden />
      )}
    <div
      style={isMobile ? undefined : { width }}
      className={cn(
        'flex flex-col overflow-hidden border bg-card text-foreground',
        // Mobile: full drawer over the scrim. Desktop: a resizable card that sits
        // as the right-most flex sibling (same chrome as the + AddPanel).
        isMobile
          ? 'fixed bottom-2 left-2 right-2 top-2 z-[55] rounded-2xl shadow-elevation-8 animate-fade-in'
          : 'relative shrink-0 rounded-xl shadow-elevation-3',
      )}
    >
      {/* Resize handle — desktop only, on the left (content-facing) edge. */}
      {!isMobile && (
        <div
          onMouseDown={onDragStart}
          className="absolute left-0 top-0 z-20 h-full w-1.5 cursor-col-resize hover:bg-primary/20"
          title="Drag to resize"
          aria-hidden
        />
      )}

      {/* Top icon area — its bottom border takes the colour of the content being
          filtered (workspace/context accent); default border when none (→ black
          once a global section exists). */}
      <div
        // Always 3px (matches the content header's accent underline); only the
        // colour varies — the content accent when there is one, else the default
        // border colour (e.g. a white/no-accent workspace like Universe).
        className="flex h-12 shrink-0 items-center justify-between gap-1 border-b-[3px] px-2"
        style={activeAccentColor ? { borderBottomColor: activeAccentColor } : undefined}
      >
        <div className="flex items-center gap-1">
          {TABS.map(({ view, icon: Icon, label }) => (
            <button
              key={view}
              type="button"
              onClick={() => setView(view)}
              aria-label={label}
              title={label}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                t1View === view
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          {!isMobile && (
            <button
              type="button"
              onClick={toggleWide}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={isWide ? 'Shrink toolbox' : 'Expand toolbox'}
              title={isWide ? 'Shrink toolbox' : 'Expand to half screen'}
            >
              {isWide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={closeT1}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close toolbox"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {t1View === 'home' && <HomePanel />}
        {t1View === 'tools' && <ToolsPanel />}
        {t1View === 'agents' && <AgentsPanel />}
        {t1View === 'notifications' && <NotificationsPanel />}

        {/* T2 — agent chat overlay */}
        {t2Open && t2AgentId && (
          <div className="absolute inset-0 z-10 flex flex-col bg-background">
            <AgentChatPanel agentId={t2AgentId} onClose={closeT2} />
          </div>
        )}
      </div>
    </div>
    </>
  )
}
