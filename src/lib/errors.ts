import type { ApiError, InsufficientStockItem } from '@/types/api'

export function isApiError(e: unknown): e is ApiError {
  return !!e && typeof e === 'object' && 'code' in e && 'status' in e
}

/** Convert a backend error code into a human-readable, user-safe message. */
export function mapApiError(e: unknown): string {
  if (!isApiError(e)) return 'Something went wrong. Please try again.'
  switch (e.code) {
    case 'NETWORK_ERROR':
      return e.message
    case 'INVALID_CREDENTIALS':
      return 'Incorrect email or password.'
    case 'VALIDATION_ERROR':
      return 'Please check the highlighted fields and try again.'
    case 'INSUFFICIENT_STOCK':
      return 'Some items don’t have enough stock to confirm. See the details below.'
    case 'NEGATIVE_STOCK':
      return 'That adjustment would take stock below zero.'
    case 'ALREADY_CONFIRMED':
      return 'This challan has already been confirmed.'
    case 'ALREADY_CANCELLED':
      return 'This challan has already been cancelled.'
    case 'CHALLAN_CANCELLED':
      return 'A cancelled challan can’t be confirmed.'
    case 'FORBIDDEN':
    case 'ROLE_FORBIDDEN':
      return 'You don’t have permission to do that.'
    case 'DUPLICATE':
      return e.message
    default:
      return e.message || 'Something went wrong. Please try again.'
  }
}

/** Map a backend VALIDATION_ERROR into a { field: message } record for forms. */
export function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (isApiError(e) && e.code === 'VALIDATION_ERROR' && Array.isArray(e.details)) {
    for (const d of e.details as { field?: string; message?: string }[]) {
      if (d.field && d.message) out[d.field] = d.message
    }
  }
  return out
}

/** Extract the per-item shortfall list from an INSUFFICIENT_STOCK error. */
export function insufficientStockItems(e: unknown): InsufficientStockItem[] {
  if (isApiError(e) && e.code === 'INSUFFICIENT_STOCK' && e.details && typeof e.details === 'object') {
    const items = (e.details as { items?: InsufficientStockItem[] }).items
    if (Array.isArray(items)) return items
  }
  return []
}
