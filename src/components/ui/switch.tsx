export function Switch({ checked, disabled, onClick, label }: {
  checked: boolean
  disabled?: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}
