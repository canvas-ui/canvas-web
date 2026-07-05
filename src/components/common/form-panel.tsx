import { type ReactNode } from 'react'
import { X } from 'lucide-react'

// List-first page pattern: management pages (/contexts, /workspaces,
// /agents) show their items immediately; creation and other secondary forms
// live behind a header button and expand inline in this bordered panel.
export function FormPanel({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 shadow-elevation-1">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  )
}
