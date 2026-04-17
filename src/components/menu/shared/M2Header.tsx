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
        className="flex items-center justify-center w-8 h-8 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Back"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-semibold truncate flex-1">{title}</span>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
