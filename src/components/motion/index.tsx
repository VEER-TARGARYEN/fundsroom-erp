import { m, useReducedMotion, type Variants, type Transition } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * Shared motion vocabulary.
 *
 * Everything here funnels through `useReducedMotion()`, so honouring the OS
 * "reduce motion" setting is a property of the primitives rather than something
 * each call site has to remember. When it's on, elements still mount — they
 * just arrive without travel.
 */

/**
 * Springs tuned to feel responsive rather than bouncy, and short enough that
 * the UI never feels like it's waiting on an animation. Everything below
 * animates only `opacity` and `transform`, which the compositor can handle
 * without touching layout — the single biggest factor in whether motion feels
 * smooth on a low-powered device.
 */
export const SPRING: Transition = { type: 'spring', stiffness: 520, damping: 32, mass: 0.55 }
export const SOFT_SPRING: Transition = { type: 'spring', stiffness: 340, damping: 30, mass: 0.7 }
export const EASE: Transition = { duration: 0.17, ease: [0.22, 1, 0.36, 1] }

/** Fade + small rise. The workhorse for cards, panels and page sections. */
export function FadeIn({
  children,
  delay = 0,
  y = 8,
  className,
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...EASE, delay: reduce ? 0 : delay }}
    >
      {children}
    </m.div>
  )
}

/**
 * Parent for a staggered group. Children must be <StaggerItem>.
 * Stagger is capped by `delayChildren`/`staggerChildren` so a 100-row table
 * doesn't take three seconds to finish arriving.
 */
export function Stagger({
  children,
  className,
  gap = 0.028,
}: {
  children: ReactNode
  className?: string
  gap?: number
}) {
  const reduce = useReducedMotion()
  const variants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : gap } },
  }
  return (
    <m.div className={className} variants={variants} initial="hidden" animate="show">
      {children}
    </m.div>
  )
}

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: EASE },
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <m.div
      className={className}
      variants={
        reduce
          ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.12 } } }
          : staggerItemVariants
      }
    >
      {children}
    </m.div>
  )
}

/** Press feedback for interactive cards — subtle, no layout shift. */
export function Pressable({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const reduce = useReducedMotion()
  return (
    <m.div
      className={className}
      onClick={onClick}
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={SPRING}
    >
      {children}
    </m.div>
  )
}

// Re-exported so call sites never reach for `motion` directly — LazyMotion runs
// in strict mode, and a stray `motion.div` both throws and re-bundles the full
// feature set into the entry chunk.
export { m, useReducedMotion }
