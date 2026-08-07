import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Every content-area section carries this header, and every one of them can be
// closed. Closing navigates to `/` — the empty desk — rather than to another
// section, so the content area genuinely goes away instead of swapping for a
// different page.
export function PageHeader({
  title,
  description,
  actions,
  backTo,
  onBack,
  className,
  compact,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  // Renders a back arrow left of the title. Detail/settings views use it to
  // return to their parent; list views leave it off.
  backTo?: string
  /** Takes precedence over `backTo` — for a back step that is not a route
      change, e.g. reopening the menu panel the section was chosen from. */
  onBack?: () => void
  className?: string
  // Detail views (settings panes) sit inside a scroll container that already
  // has padding, so they drop the bottom rule and heavy type scale.
  compact?: boolean
}) {
  const navigate = useNavigate()

  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-x-3 gap-y-2',
        !compact && 'border-b pb-4',
        className,
      )}
    >
      {/* Row order on a phone: title (+ close) first, actions on their own
          line. Letting a two-button cluster share the title row squeezed the
          description into a 60px column — one word per line. On `sm` and up the
          natural order is title, actions, close. */}
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {(onBack || backTo) && (
          <button
            type="button"
            onClick={() => (onBack ? onBack() : navigate(backTo!))}
            aria-label="Back"
            title="Back"
            className="mt-1 shrink-0 text-muted-foreground transition-colors hover:text-foreground touch-target"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className={cn('truncate font-bold tracking-tight', compact ? 'text-xl' : 'text-3xl')}>
            {title}
          </h1>
          {description && (
            <p className={cn('break-words text-muted-foreground', compact ? 'mt-1 text-xs' : 'mt-2')}>
              {description}
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('/')}
        aria-label="Close"
        title="Close"
        className="order-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground touch-target"
      >
        <X className="h-4 w-4" />
      </button>

      {actions && (
        <div className="order-3 flex w-full items-center gap-2 max-sm:flex-wrap sm:order-1 sm:w-auto">
          {actions}
        </div>
      )}
    </div>
  )
}

// Standalone close control for sections whose header is a custom bar rather
// than a PageHeader (workspace, context and agent detail views).
export function CloseSectionButton({ className }: { className?: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate('/')}
      aria-label="Close"
      title="Close"
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground touch-target',
        className,
      )}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )
}

/**
 * Back control for the detail views whose header is a custom status bar
 * (workspace, context, agent) rather than a PageHeader.
 *
 * Same meaning as the arrow on a settings page, so the gesture is the same
 * wherever you are: on mobile it reopens the menu panel this view was reached
 * from, because that panel is an overlay that closed on navigation; on desktop
 * the panel is already beside the content, so it steps up to the list instead.
 * The caller supplies both, since only it knows its own section.
 */
export function SectionBackButton({
  onBack,
  title = 'Back',
  className,
}: {
  onBack: () => void
  title?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={title}
      title={title}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground touch-target',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" />
    </button>
  )
}
