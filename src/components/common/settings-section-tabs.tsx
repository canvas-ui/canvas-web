import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { SettingsSection } from '@/lib/settings-sections'

/**
 * Mobile-only switcher for a settings surface's sections.
 *
 * On desktop the section list lives in the M2 menu panel beside the content.
 * On mobile that panel is an overlay that closes on every navigation, so
 * without this the first section you open is the only one you can reach. Same
 * registry, same routes — just the shape that fits a narrow screen.
 */
export function SettingsSectionTabs<Id extends string>({
  sections,
  activeId,
  hrefFor,
  className,
}: {
  sections: readonly SettingsSection<Id>[]
  activeId: Id
  hrefFor: (id: Id) => string
  className?: string
}) {
  const navigate = useNavigate()
  const stripRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Keep the current section in view — with more sections than fit, the active
  // one is otherwise off-screen and the row looks like it starts at "General".
  //
  // Scroll THIS strip by hand rather than calling scrollIntoView: that walks
  // every scrollable ancestor, so on a page that happens to contain something
  // wide (an unwrappable URL, a code block) it drags the whole page sideways
  // and the content ends up clipped off the left edge.
  useEffect(() => {
    const strip = stripRef.current
    const chip = activeRef.current
    if (!strip || !chip) { return }
    const target = chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2
    strip.scrollTo({ left: Math.max(0, target), behavior: 'instant' as ScrollBehavior })
  }, [activeId])

  return (
    <div
      ref={stripRef}
      // Bleed to the card edge so the row reads as scrollable, matching the
      // page's own mobile padding (px-4) rather than the desktop px-6.
      className={cn('-mx-4 overflow-x-auto border-b px-4 md:hidden scrollbar-none', className)}
      role="tablist"
      aria-label="Settings sections"
    >
      <div className="flex w-max gap-1 pb-2">
        {sections.map(({ id, label, icon: Icon }) => {
          const active = id === activeId
          return (
            <button
              key={id}
              ref={active ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => navigate(hrefFor(id))}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors touch-target',
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
