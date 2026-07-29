import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind class names safely (shadcn/ui convention).
 * `clsx` resolves conditionals; `twMerge` de-duplicates conflicting utilities.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as Indian Rupee currency.
 *
 * The compact form is hand-rolled rather than using `notation: 'compact'`,
 * which degrades past a lakh-crore and renders ₹1,08,20,00,00,000 as "₹1KCr".
 * Lakh/crore units are applied explicitly so large figures stay readable.
 */
export function formatCurrency(value: number, compact = false): string {
  if (!Number.isFinite(value)) return '₹0'

  if (compact) {
    const abs = Math.abs(value)
    const sign = value < 0 ? '-' : ''
    const grouped = (n: number, dp: number) =>
      new Intl.NumberFormat('en-IN', { maximumFractionDigits: dp }).format(n)

    if (abs >= 1e7) return `${sign}₹${grouped(abs / 1e7, abs >= 1e9 ? 0 : 2)} Cr`
    if (abs >= 1e5) return `${sign}₹${grouped(abs / 1e5, 2)} L`
    if (abs >= 1e3) return `${sign}₹${grouped(abs / 1e3, 1)} K`
    return `${sign}₹${grouped(abs, 0)}`
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

/** Format a Decimal-string (or number) from the API as INR. */
export function money(value: string | number, compact = false): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  return formatCurrency(Number.isFinite(n) ? n : 0, compact)
}

/** Group a plain number with Indian digit separators (for mono stock counts). */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value)
}

/** Format an ISO date as e.g. "28 Jul 2026". Returns an em-dash for null. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Format an ISO timestamp as e.g. "28 Jul 2026, 02:14 PM". */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

/** Whole days from today to the target date (negative = overdue). */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(iso)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/** Compact relative time, e.g. "12m ago", "3h ago", "2d ago". */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}
