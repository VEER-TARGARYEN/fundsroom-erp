import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { SOFT_SPRING } from '@/components/motion'
import { Icon } from './Icon'

interface DrawerProps {
  open: boolean
  onClose: () => void
  header?: ReactNode
  children: ReactNode
  footer?: ReactNode
  widthClass?: string
}

/**
 * Right-hand slide-over (Stitch AI/detail panel pattern).
 *
 * Now unmounts when closed instead of staying in the tree translated offscreen.
 * The old version kept its children mounted permanently, so every drawer's
 * content stayed live — and focus could still land inside a "closed" panel.
 */
export function Drawer({ open, onClose, header, children, footer, widthClass = 'max-w-lg' }: DrawerProps) {
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
        <div className="fixed inset-0 z-50">
          <m.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <m.div
            role="dialog"
            aria-modal="true"
            className={cn(
              'absolute inset-y-0 right-0 flex w-full flex-col border-l border-outline-variant/20 bg-surface-container-low shadow-glow',
              widthClass,
            )}
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={SOFT_SPRING}
          >
            <div className="flex items-start justify-between gap-4 border-b border-outline-variant/10 px-5 py-4">
              <div className="min-w-0 flex-1">{header}</div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                aria-label="Close panel"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="border-t border-outline-variant/10 bg-surface-container/50 px-5 py-3">{footer}</div>
            )}
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
