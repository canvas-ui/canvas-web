import { useLocation } from 'react-router-dom'
import { useToolbox } from '@/components/toolbox/use-toolbox'
import { isBare } from './route-chrome'

// Single entry point into the toolbox on the bare quick-capture desk (home,
// share-target, empty `/`) — biggest button on screen, fixed to the viewport
// (not the layout flow) so it stays reachable on small/mobile screens
// regardless of scroll position. `env(safe-area-inset-bottom)` keeps it clear
// of Android gesture-nav / iOS home-indicator bars in PWA mode.
export function ToolboxFab() {
  const { state, setView } = useToolbox()
  const { pathname } = useLocation()

  // The panel has its own close control, so the FAB is redundant while open.
  // Same while the side AddPanel drawer is up — the FAB floats exactly over
  // its bottom-right Save/confirm controls.
  if (state.t1Open || state.addOpen) return null

  // Content pages (workspace/context views, settings, admin…) span the full
  // viewport — no floating button over them. The M0 rail carries the toolbox
  // entry there instead.
  if (!isBare(pathname)) return null

  return (
    <button
      type="button"
      onClick={() => setView('tools')}
      aria-label="Open toolbox"
      title="Open toolbox"
      className={
        // Hidden below md — it floated over every drawer's bottom-right Save/
        // confirm controls there. The mobile toolbox entry lives in the M0
        // rail (MenuBar) instead.
        'fixed z-50 hidden md:flex h-16 w-16 items-center justify-center rounded-full shadow-elevation-4 transition-colors ' +
        'bottom-fab-inset right-6 bg-foreground text-background hover:bg-foreground'
      }
    >
      {/* Brand mark — a "·|" glyph mirroring the canvas icon: the dot sits at the
          bottom-left beside an upright bar (items-end drops the short dot to the
          baseline). currentColor so it inverts with the button state. */}
      <span className="flex items-end gap-1" aria-hidden>
        <span className="mb-[1px] h-2 w-2 rounded-full bg-current" />
        <span className="h-7 w-[3px] rounded-full bg-current" />
      </span>
    </button>
  )
}
