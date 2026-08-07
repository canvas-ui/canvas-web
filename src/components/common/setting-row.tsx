import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A titled block with its controls: the shape almost every settings section is
 * built from.
 *
 * Why this exists rather than another hand-rolled `flex justify-between`: that
 * pattern gives the control cluster its natural width and lets the prose column
 * take whatever is left. On a desktop that is most of the row. On a 393px phone
 * with three buttons beside the title, what is left is about 60px — the
 * description wraps to one word per line and the title runs under the controls.
 * Every settings page had some version of it.
 *
 * So: stacked below `sm`, side by side above it. The controls keep their size,
 * the prose gets the full width, and no caller has to remember the breakpoint.
 */
export function SettingRow({
  title,
  description,
  actions,
  children,
  className,
  align = 'start',
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Anything that belongs under the title/description pair. */
  children?: ReactNode
  className?: string
  /** `center` for single-line rows (a lone toggle); `start` when prose wraps. */
  align?: 'start' | 'center'
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:justify-between sm:gap-4',
        align === 'center' ? 'sm:items-center' : 'sm:items-start',
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        {title && <h2 className="text-sm font-semibold">{title}</h2>}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && (
        // max-sm:flex-wrap: a cluster of four buttons still has to fit 393px.
        <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:flex-wrap">
          {actions}
        </div>
      )}
    </div>
  )
}
