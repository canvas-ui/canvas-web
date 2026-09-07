import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { MenuBar, MobileMenuToggle } from '../MenuBar'
import { M2Content } from '../MenuPanelArea'
import { useMenu } from '../use-menu'
import { DocumentSideCard } from '../DocumentSideCard'
import { ContextList } from '@/components/menu/contexts/ContextList'
import { WorkspaceList } from '@/components/menu/workspaces/WorkspaceList'
import { AgentList } from '@/components/menu/agents/AgentList'
import { AdminMenu } from '@/components/menu/admin/AdminMenu'
import { SettingsMenu } from '@/components/menu/settings/SettingsMenu'
import { AddPanel } from '@/components/toolbox/AddPanel'
import { ToolboxPanel } from '@/components/toolbox/ToolboxPanel'
import { ToolboxFab } from '../ToolboxFab'
import { LensFeedWidget } from '@/components/toolbox/LensFeedWidget'
import { CanvasRouter } from './CanvasRouter'
import { MAIN_COLUMN, useCanvasRow, type CanvasEntry, type CanvasRow } from './use-canvas-row'
import './strip.css'

// EXPERIMENT (Settings > Appearance > Layout: "Canvas strip").
//
// The shell as one horizontal strip of columns on the desk:
//
//   [M0 rail] | [M1 list] [M2 tree] [main canvas] [canvas] [canvas] …
//
// Menus are part of the background (no panel surface); the active workspace
// lifts off it. M2 does not slide over M1 — it appears beside it and the
// strip scrolls to bring it into view; ArrowLeft walks back. Canvases are
// ISO 216 cards (1:√2, height fixed, width follows) that can be expanded to
// the full strip width. ArrowLeft/Right move between columns, a touch swipe
// scrolls the same strip natively (scroll-snap), ArrowUp/Down switch rows
// (one row per opened pin, see canvas-row-context.tsx).

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

function M1List({ section }: { section: ReturnType<typeof useMenu>['state']['activeSection'] }) {
  if (section === 'contexts') return <ContextList />
  if (section === 'workspaces') return <WorkspaceList />
  if (section === 'agents') return <AgentList />
  if (section === 'admin') return <AdminMenu />
  if (section === 'settings') return <SettingsMenu />
  return null
}

function titleOf(entry: CanvasEntry | null, pathname: string): string {
  if (entry?.kind === 'document') return getDocumentDisplayInfo(entry.document).title
  const path = entry?.kind === 'route' ? entry.location : pathname
  const segments = path.split('?')[0].split('/').filter(Boolean)
  if (segments.length === 0) return 'Desk'
  return decodeURIComponent(segments[segments.length - 1])
}

interface CanvasFrameProps {
  id: string
  title: string
  expanded: boolean
  focused: boolean
  onFocus: (id: string) => void
  onToggleExpanded: (id: string) => void
  onClose?: (id: string) => void
  children: ReactNode
}

function CanvasFrame({ id, title, expanded, focused, onFocus, onToggleExpanded, onClose, children }: CanvasFrameProps) {
  return (
    <section
      data-strip-col={id}
      className={cn('strip-canvas surface-sheet', expanded && 'strip-canvas--wide', focused && 'strip-canvas--focused')}
      onPointerDownCapture={() => onFocus(id)}
      aria-label={title}
    >
      <header className="strip-canvas-bar">
        <span className="strip-canvas-title" title={title}>{title}</span>
        <button
          type="button"
          className="strip-canvas-btn"
          title={expanded ? 'Card size' : 'Expand to full width'}
          aria-pressed={expanded}
          onClick={() => onToggleExpanded(id)}
        >
          {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
        {onClose && (
          <button type="button" className="strip-canvas-btn" title="Close canvas" onClick={() => onClose(id)}>
            <X className="size-3.5" />
          </button>
        )}
      </header>
      <div className="strip-canvas-body">{children}</div>
    </section>
  )
}

function RowCanvases({ row, pathname }: { row: CanvasRow; pathname: string }) {
  const rowApi = useCanvasRow()!
  const { focus, setFocus, toggleExpanded, closeCanvas, navigateCanvas } = rowApi
  const onNavigate = useCallback((id: string) => (next: string) => navigateCanvas(id, next), [navigateCanvas])
  return (
    <>
      <CanvasFrame
        id={MAIN_COLUMN}
        title={titleOf(null, pathname)}
        expanded={row.mainExpanded}
        focused={focus === MAIN_COLUMN}
        onFocus={setFocus}
        onToggleExpanded={toggleExpanded}
      >
        {/* id: maximized canvas widgets portal into #content-area, same as classic */}
        <main id="content-area" className="relative flex-1 min-h-0 min-w-0 overflow-auto">
          <Outlet />
        </main>
      </CanvasFrame>
      {row.entries.map((entry) => (
        <CanvasFrame
          key={entry.id}
          id={entry.id}
          title={titleOf(entry, pathname)}
          expanded={!!entry.expanded}
          focused={focus === entry.id}
          onFocus={setFocus}
          onToggleExpanded={toggleExpanded}
          onClose={closeCanvas}
        >
          {entry.kind === 'route' ? (
            <div className="relative flex-1 min-h-0 min-w-0 overflow-auto">
              <CanvasRouter location={entry.location} onNavigate={onNavigate(entry.id)} />
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 min-w-0 items-stretch">
              <DocumentSideCard entry={entry} onClose={() => closeCanvas(entry.id)} />
            </div>
          )}
        </CanvasFrame>
      ))}
    </>
  )
}

// A row that is not active keeps its canvases (state lives in the provider)
// but renders as a ghost line of chips: walking rows should feel spatial
// without mounting every page in every row.
function GhostRow({ row }: { row: CanvasRow }) {
  return (
    <div className="strip-ghost-row" aria-hidden>
      <span className="strip-ghost-chip strip-ghost-chip--main">{titleOf(null, row.main)}</span>
      {row.entries.map((e) => (
        <span key={e.id} className="strip-ghost-chip">{titleOf(e, row.main)}</span>
      ))}
    </div>
  )
}

export function StripShell() {
  const { state, closeM1, closeM2 } = useMenu()
  const rowApi = useCanvasRow()!
  const { rows, activeRow, focus, setFocus, moveRow, closeRow } = rowApi
  const { pathname } = useLocation()
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEscapeClose(closeM1, state.m1Open && !state.m2Open)
  useEscapeClose(closeM2, state.m2Open)

  // Publish the strip's box as CSS vars: the ISO card sizes itself from the
  // height, the expanded card from the width.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const publish = () => {
      el.style.setProperty('--strip-w', `${el.clientWidth}px`)
      el.style.setProperty('--strip-h', `${el.clientHeight}px`)
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Menu transitions move the focus: opening M2 focuses it ("focusing it into
  // the view"), closing a layer hands focus back to the column left of it.
  const wasM2 = useRef(state.m2Open)
  useEffect(() => {
    if (state.m2Open && !wasM2.current) setFocus('m2')
    if (!state.m2Open && wasM2.current && focus === 'm2') setFocus(state.m1Open ? 'm1' : MAIN_COLUMN)
    wasM2.current = state.m2Open
  }, [state.m2Open, state.m1Open, focus, setFocus])
  useEffect(() => {
    if (!state.m1Open && focus === 'm1') setFocus(MAIN_COLUMN)
  }, [state.m1Open, focus, setFocus])

  // Focus → scroll the column into view (nearest edge, so a new canvas on
  // the right slides in without throwing the rest of the strip away).
  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-strip-col="${CSS.escape(focus)}"]`)
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [focus, rows, activeRow])

  const columns = useCallback((): string[] => {
    const row = rows[activeRow]
    return [
      ...(state.m1Open ? ['m1'] : []),
      ...(state.m2Open ? ['m2'] : []),
      MAIN_COLUMN,
      ...(row ? row.entries.map((e) => e.id) : []),
    ]
  }, [rows, activeRow, state.m1Open, state.m2Open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return
      const target = e.target as HTMLElement | null
      if (target?.closest(EDITABLE) || target?.closest('[role="dialog"]')) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const cols = columns()
        const i = Math.max(0, cols.indexOf(focus))
        const next = cols[i + (e.key === 'ArrowRight' ? 1 : -1)]
        if (!next) return
        e.preventDefault()
        setFocus(next)
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && rows.length > 1) {
        e.preventDefault()
        moveRow(e.key === 'ArrowDown' ? 1 : -1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [columns, focus, setFocus, moveRow, rows.length])

  return (
    <>
      <div className="strip-shell flex h-viewport w-full overflow-hidden surface-desk gap-shell p-shell">
        <MenuBar />
        <div ref={scrollerRef} className="strip-scroller">
          {state.m1Open && (
            <div
              data-strip-col="m1"
              className={cn('strip-col strip-menu-col', focus === 'm1' && 'strip-col--focused')}
              onPointerDownCapture={() => setFocus('m1')}
            >
              <M1List section={state.activeSection} />
            </div>
          )}
          {state.m2Open && (
            <div
              data-strip-col="m2"
              className={cn('strip-col strip-menu-col', focus === 'm2' && 'strip-col--focused')}
              onPointerDownCapture={() => setFocus('m2')}
            >
              <M2Content />
            </div>
          )}
          <div className="strip-rows" style={{ transform: `translateY(${-activeRow * 100}%)` }}>
            {rows.map((row, i) => (
              <div key={row.key} className={cn('strip-row', i === activeRow && 'strip-row--active')}>
                {rows.length > 1 && (
                  <div className="strip-row-head">
                    <span className="strip-row-label">{row.label}</span>
                    {i > 0 && i === activeRow && (
                      <button type="button" className="strip-canvas-btn" title="Close row" onClick={() => closeRow(row.key)}>
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                )}
                <div className="strip-row-canvases">
                  {i === activeRow ? <RowCanvases row={row} pathname={pathname} /> : <GhostRow row={row} />}
                </div>
              </div>
            ))}
          </div>
        </div>
        <AddPanel />
        <ToolboxPanel />
      </div>
      <ToolboxFab />
      <MobileMenuToggle />
      <LensFeedWidget />
    </>
  )
}
