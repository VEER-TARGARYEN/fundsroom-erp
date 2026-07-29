import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'

const base =
  'w-full rounded-lg border bg-surface-container-low text-body-sm text-on-surface placeholder:text-on-surface-variant/60 transition-colors focus:outline-none focus:ring-2 disabled:opacity-50'
const okBorder = 'border-outline-variant/20 focus:border-secondary/50 focus:ring-secondary/20'
const errBorder = 'border-error/50 focus:border-error focus:ring-error/20'

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(base, 'h-9 px-3', invalid ? errBorder : okBorder, className)}
    {...props}
  />
))
Input.displayName = 'Input'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(base, 'min-h-[76px] px-3 py-2', invalid ? errBorder : okBorder, className)}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ className, invalid, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        base,
        'h-9 appearance-none pl-3 pr-9',
        invalid ? errBorder : okBorder,
        '[&>option]:bg-surface-container [&>option]:text-on-surface',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <Icon
      name="expand_more"
      size={18}
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
    />
  </div>
))
Select.displayName = 'Select'

interface FieldProps {
  label: string
  htmlFor?: string
  error?: string
  required?: boolean
  className?: string
  children: ReactNode
}

export function Field({ label, htmlFor, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block font-label-caps text-label-caps uppercase text-on-surface-variant">
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </label>
      {children}
      {error && <p className="text-data-mono text-error">{error}</p>}
    </div>
  )
}
