import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'
import { buttonVariants, type ButtonVariantProps } from './button-variants'

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
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariantProps {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'

export { Button }
