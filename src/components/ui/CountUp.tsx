import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * Animates a KPI from 0 to its value on mount.
 *
 * Takes a `format` function rather than a number so currency/locale formatting
 * stays owned by the caller — the component only animates the magnitude and
 * never has to know about ₹, lakh or crore.
 *
 * Driven by requestAnimationFrame rather than a motion value because the output
 * is formatted text, not a style property, and this avoids a re-render storm.
 */
export function CountUp({
  value,
  format,
  duration = 900,
  className,
}: {
  value: number
  format: (n: number) => string
  duration?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(() => (reduce ? value : 0))
  const frame = useRef<number>()
  const settle = useRef<ReturnType<typeof setTimeout>>()
  const from = useRef(0)

  useEffect(() => {
    // A hidden tab gets no animation frames, which would otherwise leave the
    // figure reading 0 indefinitely — worse than not animating at all.
    if (reduce || !Number.isFinite(value) || document.hidden) {
      from.current = value
      setDisplay(value)
      return
    }

    const start = performance.now()
    const origin = from.current
    // easeOutExpo — fast out of the gate, settles gently on the final figure.
    const ease = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setDisplay(origin + (value - origin) * ease(t))
      if (t < 1) frame.current = requestAnimationFrame(tick)
      else from.current = value
    }

    frame.current = requestAnimationFrame(tick)

    // Safety net: timers still fire when frames don't (backgrounded tab,
    // throttled renderer), so the correct number always lands.
    settle.current = setTimeout(() => {
      from.current = value
      setDisplay(value)
    }, duration + 150)

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      if (settle.current) clearTimeout(settle.current)
    }
  }, [value, duration, reduce])

  // `tabular-nums` stops the width jittering as digits change.
  return <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>{format(display)}</span>
}
