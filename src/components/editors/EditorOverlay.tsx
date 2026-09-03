import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Maximize2, Minimize2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The shell every content editor opens in — one chrome for sketches, markdown
 * and text, so "edit in the editor" means the same thing everywhere.
 *
 * PORTALS TO <body> ON PURPOSE. Glass themes put `backdrop-filter` on panels
 * and modals, and a filtered ancestor becomes the containing block for
 * `position: fixed` — an overlay rendered inside the document modal was
 * clipped to the modal's box instead of covering the viewport.
 */
export function EditorOverlay({
  title, onClose, onDetails, actions, children,
}: {
  /** Header content: a title input, a filename, whatever the editor needs. */
  title: ReactNode
  onClose: () => void
  /** Jump to the document's metadata form (title/tags/comment/location). */
  onDetails?: () => void
  /** Save button and friends, right-aligned. */
  actions?: ReactNode
  children: ReactNode
}) {
  const [maximized, setMaximized] = useState(true)

  return createPortal(
    <div className={cn('fixed inset-0 z-fullscreen flex bg-scrim', maximized ? 'p-0' : 'p-4 md:p-10')}>
      <div
        className={cn(
          'flex min-h-0 w-full flex-col overflow-hidden bg-background surface-glass',
          maximized ? '' : 'rounded-lg border shadow-elevation-4',
        )}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Back" title="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {title}
          <div className="flex-1" />
          {onDetails && (
            <Button variant="ghost" size="sm" onClick={onDetails} title="Edit details (title, tags, comment)">
              <Info className="mr-1.5 h-4 w-4" /> Details
            </Button>
          )}
          <Button
            variant="ghost" size="sm"
            onClick={() => setMaximized((m) => !m)}
            title={maximized ? 'Restore' : 'Maximize'}
            aria-label={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          {actions}
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>,
    window.document.body,
  )
}

export default EditorOverlay
