import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Button.
 *
 * Sizing, radius, weight and border thickness come from the `--btn-*` component
 * tokens rather than literal utilities, so a theme restyles every button in the
 * app without this file changing. See src/theme/css/components.css.
 *
 * The size variants scale relative to `--btn-height`, which itself tracks the
 * active density — so a `sm` button is small *for the current density* rather
 * than a fixed 32px that becomes untappable on a phone.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'text-sm transition-colors',
    // `number:` type hint disambiguates font-weight from font-family, which
    // Tailwind cannot infer from a bare custom property.
    'rounded-(--btn-radius) font-(number:--btn-font-weight)',
    // The shared focus treatment; see src/theme/css/utilities.css.
    'focus-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-elevation-1 hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-elevation-1 hover:bg-destructive/90',
        outline:
          'border-(length:--btn-border-width) border-input bg-background shadow-elevation-1 hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-elevation-1 hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-(--btn-height) px-(--btn-padding-x)',
        sm: 'h-control-sm rounded-(--btn-radius) px-3 text-xs',
        lg: 'h-control-lg rounded-(--btn-radius) px-8',
        // Square by construction — width follows height, so it stays square at
        // every density instead of needing a per-density override.
        icon: 'h-(--btn-height) w-(--btn-height)',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
