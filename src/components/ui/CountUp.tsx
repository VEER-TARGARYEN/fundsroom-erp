import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * Animates a KPI from 0 to its value on mount.
 *
 * Writes to `textContent` through a ref rather than calling setState per frame.
 * The previous version re-rendered on every animation frame, so five KPI cards
 * meant ~300 React renders a second; this keeps the whole animation off the
 * React commit path entirely.
 *
 * Takes a `format` function rather than a number so currency/locale formatting
 * stays owned by the caller — the component only animates the magnitude and
 * never has to know about ₹, lakh or crore.
 */
export function CountUp({
  value,
  format,
  duration = 650,
  className,
}: {
  value: number
  format: (n: number) => string
  duration?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const el = useRef<HTMLSpanElement>(null)
  const frame = useRef<number>()
  const settle = useRef<ReturnType<typeof setTimeout>>()
  const from = useRef(0)

  useEffect(() => {
    const node = el.current
    if (!node) return

    const write = (n: number) => {
      node.textContent = format(n)
    }

    // A hidden tab gets no animation frames, which would otherwise leave the
    // figure reading 0 indefinitely — worse than not animating at all.
    if (reduce || !Number.isFinite(value) || document.hidden) {
      from.current = value
      write(value)
      return
    }

    const start = performance.now()
    const origin = from.current
    // easeOutExpo — fast out of the gate, settles gently on the final figure.
    const ease = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      write(origin + (value - origin) * ease(t))
      if (t < 1) frame.current = requestAnimationFrame(tick)
      else from.current = value
    }
    frame.current = requestAnimationFrame(tick)

    // Safety net: timers still fire when frames don't (backgrounded tab,
    // throttled renderer), so the correct number always lands.
    settle.current = setTimeout(() => {
      from.current = value
      write(value)
    }, duration + 150)

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      if (settle.current) clearTimeout(settle.current)
    }
  }, [value, duration, reduce, format])

  // Rendered with the final value so it's correct before effects run (and for
  // anything reading the DOM without paint, e.g. crawlers or tests).
  // `tabular-nums` stops the width jittering as digits change.
  return (
    <span ref={el} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {format(reduce ? value : 0)}
    </span>
  )
}
