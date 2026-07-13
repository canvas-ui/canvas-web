import { Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useSideView } from './side-view-context'
import { DocumentSideCard } from './DocumentSideCard'

// Detail views (canvas, file-manager, agent chat, settings) manage their own
// full-height scroll + padding, so the sheet stays flush for them.
function isFullBleed(pathname: string): boolean {
  const [section, entity] = pathname.split('/').filter(Boolean)
  return ['contexts', 'workspaces', 'agents'].includes(section) && Boolean(entity)
}

// The FAB quick-capture surface (home, and the share-target landing that
// reuses it) has no page chrome of its own — no "sheet of paper" card, no
// padding — it sits directly on the canvas-desk background.
function isBare(pathname: string): boolean {
  const [section] = pathname.split('/').filter(Boolean)
  return section === 'home' || section === 'share-target'
}

// Shared mobile "drawer" treatment — same prominence as the M1/M2 menu panel
// overlay (floating card over a scrim, elevation-8). Spans from left-2 since
// the M0 rail is hidden by default on small screens.
// z-[48]/z-[47]: above the open M0 rail (z-[46]) so side card / toolbox
// drawers fully cover the menu on mobile.
const MOBILE_DRAWER =
  'max-md:fixed max-md:left-2 max-md:right-2 max-md:top-2 max-md:bottom-2 max-md:z-[48] ' +
  'max-md:py-0 max-md:pr-0 max-md:rounded-2xl max-md:shadow-elevation-8 max-md:animate-fade-in'
const MOBILE_SCRIM = 'fixed inset-0 z-[47] bg-black/30 animate-fade-in md:hidden'

export function ContentArea() {
  const { pathname } = useLocation()
  const fullBleed = isFullBleed(pathname)
  const bare = isBare(pathname)
  const { entry, close: closeSideView } = useSideView()

  return (
    <div className={cn('relative flex flex-col flex-1 min-w-0', !bare && 'canvas-sheet')}>
      <div className="flex flex-1 min-h-0 gap-2">
        {/* id + relative: maximized canvas widgets portal in here and fill
            the content area (full viewport is reserved for public shares). */}
        <main id="content-area" className={cn('relative flex-1 min-h-0 min-w-0 overflow-auto', !fullBleed && !bare && 'p-6')}>
          <Outlet />
        </main>
        {/* Side panels sit beside the page on desktop; on mobile there's no
            room for a second column, so they become M1/M2-style drawers. */}
        {entry && (
          <>
            <div className={MOBILE_SCRIM} onClick={closeSideView} aria-hidden />
            <div className={cn('flex shrink-0 items-stretch py-2 pr-2', MOBILE_DRAWER)}>
              <DocumentSideCard />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
