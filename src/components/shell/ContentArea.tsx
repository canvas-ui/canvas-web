import { Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

// Detail views (canvas, file-manager, agent chat, settings) manage their own
// full-height scroll + padding, so the sheet stays flush for them.
function isFullBleed(pathname: string): boolean {
  const [section, entity] = pathname.split('/').filter(Boolean)
  return ['contexts', 'workspaces', 'agents'].includes(section) && Boolean(entity)
}

export function ContentArea() {
  const { pathname } = useLocation()
  const fullBleed = isFullBleed(pathname)

  return (
    <div className="relative flex flex-col flex-1 min-w-0 canvas-sheet">
      <main className={cn('flex-1 min-h-0 overflow-auto', !fullBleed && 'p-6')}>
        <Outlet />
      </main>
    </div>
  )
}
