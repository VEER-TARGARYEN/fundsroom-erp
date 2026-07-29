import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { SPRING } from '@/components/motion'
import { Icon } from './Icon'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  size?: 'md' | 'lg'
  children: ReactNode
  footer?: ReactNode
}

/**
 * Wrapped in AnimatePresence so closing animates out. Previously the component
 * returned null on `!open`, which unmounted it instantly and made dismissal
 * feel abrupt next to the fade-in on open.
 */
export function Modal({ open, onClose, title, description, size = 'md', children, footer }: ModalProps) {
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <m.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <div className="flex min-h-full items-start justify-center p-4 sm:p-6">
            <m.div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className={cn(
                'relative z-10 mt-8 w-full rounded-xl border border-outline-variant/20 bg-surface-container shadow-glow',
                size === 'lg' ? 'max-w-2xl' : 'max-w-lg',
              )}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={SPRING}
            >
              <div className="flex items-start justify-between gap-4 border-b border-outline-variant/10 px-5 py-4">
                <div>
                  <h2 className="text-title-md font-medium text-on-surface">{title}</h2>
                  {description && <p className="mt-0.5 text-body-sm text-on-surface-variant">{description}</p>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                  aria-label="Close"
                >
                  <Icon name="close" size={20} />
                </button>
              </div>
              <div className="px-5 py-4">{children}</div>
              {footer && (
                <div className="flex items-center justify-end gap-2 rounded-b-xl border-t border-outline-variant/10 bg-surface-container-low/50 px-5 py-3">
                  {footer}
                </div>
              )}
            </m.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
