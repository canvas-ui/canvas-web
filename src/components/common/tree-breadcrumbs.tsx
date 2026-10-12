import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { TreeBreadcrumb } from '@/lib/tree-breadcrumbs'

export function TreeBreadcrumbs({ items, onNavigate, disabled, className, label = 'Tree path' }: {
  items: TreeBreadcrumb[]
  onNavigate?: (path: string) => void
  disabled?: boolean
  className?: string
  label?: string
}) {
  const listRef = useRef<HTMLOListElement>(null)
  const currentPath = items[items.length - 1]?.path
  useEffect(() => {
    // Keep the current folder visible on narrow panes. Ancestors remain
    // reachable by scrolling, swiping, or tabbing through the buttons.
    const list = listRef.current
    if (list) list.scrollLeft = list.scrollWidth
  }, [currentPath])

  return (
    <nav aria-label={label} className={cn('min-w-0 flex-1', className)}>
      <ol ref={listRef} className="flex min-w-0 items-center gap-1 overflow-x-auto py-0.5 text-sm">
        {items.map((item, index) => {
          const current = index === items.length - 1
          const itemClass = cn('block max-w-56 truncate rounded px-1.5 py-1', current ? 'font-medium text-foreground' : 'text-muted-foreground')
          return (
            <li key={item.path} className="flex shrink-0 items-center gap-1">
              {index > 0 && <span aria-hidden="true" className="text-muted-foreground/60">/</span>}
              {onNavigate && !current ? (
                <button type="button" title={item.path === '/' ? `${item.label} (root)` : item.path}
                  disabled={disabled} onClick={() => onNavigate(item.path)}
                  className={cn(itemClass, 'hover:bg-accent hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50')}>
                  {item.label}
                </button>
              ) : (
                <span title={item.path === '/' ? item.label : item.path} aria-current={current ? 'location' : undefined} className={itemClass}>{item.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
