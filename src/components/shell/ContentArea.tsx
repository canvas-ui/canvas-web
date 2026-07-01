import { Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

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

export function ContentArea() {
  const { pathname } = useLocation()
  const fullBleed = isFullBleed(pathname)
  const bare = isBare(pathname)

  return (
    <div className={cn('relative flex flex-col flex-1 min-w-0', !bare && 'canvas-sheet')}>
      <main className={cn('flex-1 min-h-0 overflow-auto', !fullBleed && !bare && 'p-6')}>
        <Outlet />
      </main>
    </div>
  )
}
