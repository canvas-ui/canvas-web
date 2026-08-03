import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Input.
 *
 * Height, radius and border thickness come from the `--input-*` component
 * tokens (see src/theme/css/components.css), so the high-contrast theme's 2px
 * borders and the density setting's taller touch targets both apply without
 * this file knowing that either exists.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex w-full bg-transparent px-3 py-1 text-base transition-colors md:text-sm',
          'h-(--input-height) rounded-(--input-radius)',
          'border-(length:--input-border-width) border-input shadow-elevation-1',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          'placeholder:text-muted-foreground',
          'focus-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
