import { useState } from 'react'
import { FolderTree } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { LinkToCard, type LinkToTarget } from './LinkToCard'
import { LinkToSidePanel, LINK_TO_SIDE_SIZE } from './LinkToSidePanel'
import type { PickerTab } from './tree-picker-utils'

// THE input for "a workspace tree path" anywhere in the app: a plain text
// field (power users type) plus a browse button that opens the same
// LinkToCard tree picker every other surface uses (Link to…, rule builder,
// offline pins). New features should reach for this instead of hand-rolling
// a workspace <select> + path <Input> pair — that form has been reinvented
// enough times.
interface PathPickerFieldProps {
  value: string
  onChange: (value: string) => void
  /**
   * Raw pick callback — when provided it replaces the default write-back,
   * for callers that also need the workspace/tree (e.g. to sync a sibling
   * workspace field, or to prefix directory-tree paths).
   */
  onPickTarget?: (path: string, ctx: LinkToTarget) => void
  /** Skip the picker's workspace step and browse only this workspace. */
  fixedWorkspaceName?: string
  /** 'url' (default) writes workspace://path; 'path' writes the bare /path. */
  format?: 'url' | 'path'
  tabs?: PickerTab[]
  pickerTitle?: string
  placeholder?: string
  id?: string
  disabled?: boolean
  className?: string
  inputClassName?: string
}

export function PathPickerField({
  value,
  onChange,
  onPickTarget,
  fixedWorkspaceName,
  format = 'url',
  tabs = ['context', 'directory'],
  pickerTitle = 'Pick a path…',
  placeholder,
  id,
  disabled,
  className,
  inputClassName,
}: PathPickerFieldProps) {
  const [open, setOpen] = useState(false)

  const handleConfirm = (paths: string[], ctx: LinkToTarget) => {
    setOpen(false)
    const path = paths[0]
    if (!path) return
    if (onPickTarget) {
      onPickTarget(path, ctx)
      return
    }
    onChange(format === 'url' ? `${ctx.workspaceName}://${path.replace(/^\/+/, '')}` : path)
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn('font-mono', inputClassName)}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label="Browse tree paths"
        title="Browse…"
        className="shrink-0"
      >
        <FolderTree className="h-4 w-4" />
      </Button>
      {open && (
        <LinkToSidePanel onClose={() => setOpen(false)}>
          <LinkToCard
            sizeClassName={LINK_TO_SIDE_SIZE}
            multiple={false}
            tabs={tabs}
            fixedWorkspaceName={fixedWorkspaceName}
            title={pickerTitle}
            confirmLabel="Use path"
            onConfirm={handleConfirm}
            onClose={() => setOpen(false)}
          />
        </LinkToSidePanel>
      )}
    </div>
  )
}
