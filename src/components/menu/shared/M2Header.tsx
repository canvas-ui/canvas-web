import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface M2HeaderProps {
  title: string
  onBack: () => void
  action?: React.ReactNode
  className?: string
}

export function M2Header({ title, onBack, action, className }: M2HeaderProps) {
  return (
    <div className={cn('flex items-center h-12 px-2 border-b border-sidebar-border shrink-0 gap-1', className)}>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-0.5 h-8 rounded px-1 hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors flex-1 min-w-0"
        title="Back"
      >
        <ChevronLeft className="w-4 h-4 shrink-0" />
        <span className="text-sm font-semibold truncate">{title}</span>
      </button>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
