import { cva, type VariantProps } from 'class-variance-authority'

export const buttonVariants = cva(
  ['inline-flex items-center justify-center gap-2 whitespace-nowrap', 'text-sm transition-colors', 'rounded-(--btn-radius) font-(number:--btn-font-weight)', 'focus-ring', 'disabled:pointer-events-none disabled:opacity-50', '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'],
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-elevation-1 hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-elevation-1 hover:bg-destructive/90',
        outline: 'border-(length:--btn-border-width) border-input bg-background shadow-elevation-1 hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-elevation-1 hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: { default: 'h-(--btn-height) px-(--btn-padding-x)', sm: 'h-control-sm rounded-(--btn-radius) px-3 text-xs', lg: 'h-control-lg rounded-(--btn-radius) px-8', icon: 'h-(--btn-height) w-(--btn-height)' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)
export type ButtonVariantProps = VariantProps<typeof buttonVariants>
