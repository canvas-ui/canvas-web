import { useToolbox } from '@/components/toolbox/toolbox-context'

// Single entry point into the toolbox — biggest button on screen, fixed to
// the viewport (not the layout flow) so it stays reachable on small/mobile
// screens regardless of scroll position. `env(safe-area-inset-bottom)`
// keeps it clear of Android gesture-nav / iOS home-indicator bars in PWA mode.
export function ToolboxFab() {
  const { state, setView } = useToolbox()

  // The panel has its own close control, so the FAB is redundant while open.
  if (state.t1Open) return null

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
        'fixed z-50 hidden md:flex h-16 w-16 items-center justify-center rounded-2xl shadow-elevation-4 transition-colors ' +
        'bottom-[max(1rem,env(safe-area-inset-bottom))] right-6 bg-zinc-900 text-white hover:bg-zinc-800'
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
