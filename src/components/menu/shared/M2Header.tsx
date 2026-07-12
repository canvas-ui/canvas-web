import { ChevronLeft, X } from 'lucide-react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useMenu } from '@/components/shell/menu-context'
import { visibleAccentColor } from '@/utils/color'

interface M2HeaderProps {
  title: string
  onBack: () => void
  action?: React.ReactNode
  className?: string
  // Workspace/context style cues: icon prepended to the title, accent color as
  // a left border (M1 rows carry it on the right, so entering M2 keeps the
  // color flowing left-to-right). Near-white colors fall back to neutral.
  icon?: string | null
  accentColor?: string | null
}

export function M2Header({ title, onBack, action, className, icon, accentColor }: M2HeaderProps) {
  const { closeM1 } = useMenu()
  const accent = visibleAccentColor(accentColor)
  return (
    <div
      className={cn('flex items-center h-12 px-2 border-b border-sidebar-border shrink-0 gap-1', className)}
      // 3px bottom border matches the content-area header bars (also h-12), so
      // the accent line flows continuously from M2 into the content area.
      style={{
        ...(accent ? { borderLeft: `6px solid ${accent}` } : {}),
        borderBottomWidth: 3,
        ...(accent ? { borderBottomColor: accent } : {}),
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-0.5 h-8 rounded px-1 hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors flex-1 min-w-0"
        title="Back"
      >
        <ChevronLeft className="w-4 h-4 shrink-0" />
        {icon && (
          <Icon
            icon={icon}
            width={16}
            height={16}
            color={accent}
            className={cn('mr-1 shrink-0', !accent && 'text-muted-foreground')}
          />
        )}
        <span className="text-sm font-semibold truncate">{title}</span>
      </button>
      {action && <div className="shrink-0">{action}</div>}
      <button
        type="button"
        onClick={closeM1}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        title="Close menu"
        aria-label="Close menu"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
