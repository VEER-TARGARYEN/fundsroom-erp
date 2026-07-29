import { cn } from '@/lib/utils'

interface IconProps {
  /** Material Symbols Outlined ligature name, e.g. "grid_view". */
  name: string
  className?: string
  /** Pixel size (defaults to inherited font-size / 20px in most contexts). */
  size?: number
  filled?: boolean
  weight?: number
}

/** Material Symbols Outlined icon (the Stitch icon system). */
export function Icon({ name, className, size, filled, weight = 400 }: IconProps) {
  return (
    <span
      className={cn('material-symbols-outlined shrink-0', className)}
      style={{
        fontSize: size ? `${size}px` : undefined,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size ?? 24}`,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}
