import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Layout shared by the add forms. In the side panel everything stacks; in the
 * full editor (`wide`) the title and body take the left column at full
 * height and the details sit in a column on the right, with the actions
 * across the bottom. The element tree is the same either way, so switching
 * between the two keeps whatever has been typed.
 */
export function AddFormLayout({ wide, main, side, footer }: { wide: boolean; main: ReactNode; side: ReactNode; footer: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-4 p-4', wide && 'md:grid md:h-full md:min-h-0 md:grid-cols-[minmax(0,1fr)_18rem] md:grid-rows-[minmax(0,1fr)_auto] md:gap-x-6 md:p-6')}>
      <div className={cn('flex min-w-0 flex-col gap-4', wide && 'md:min-h-0')}>{main}</div>
      <div className={cn('flex min-w-0 flex-col gap-4', wide && 'md:min-h-0 md:overflow-y-auto md:border-l md:pl-6')}>{side}</div>
      <div className={cn('flex flex-col gap-2', wide && 'md:col-span-2 md:border-t md:pt-4')}>{footer}</div>
    </div>
  )
}

/** A labelled body editor that takes the remaining height of the main column when `wide`. */
export function AddFormBody({ wide, label, children }: { wide: boolean; label: ReactNode; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', wide && 'md:min-h-0 md:flex-1')}>
      {label}
      <div className={cn(wide && 'md:min-h-0 md:flex-1')}>{children}</div>
    </div>
  )
}
