import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Material Symbols name rendered before the label. */
  icon?: string
  loading?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-fixed-dim',
  secondary:
    'bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-outline-variant/20',
  ghost: 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
  danger: 'bg-error text-on-error hover:opacity-90',
  ai: 'bg-secondary-container text-on-secondary-container hover:brightness-110',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-body-sm',
  md: 'h-9 gap-2 px-4 text-body-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', icon, loading, disabled, children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Icon name="progress_activity" size={18} className="animate-spin" />
      ) : (
        icon && <Icon name={icon} size={18} />
      )}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
