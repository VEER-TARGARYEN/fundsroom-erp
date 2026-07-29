import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { ApiEnvelope, Challan, StockLog } from '@/types/api'

/**
 * Sections the caller's role may not read come back as `null` rather than being
 * omitted, so the shape is stable and the UI can branch on presence alone.
 */
export interface DashboardSummary {
  customers: { total: number; active: number; leads: number } | null
  products: {
    total: number
    lowStock: number
    outOfStock: number
    /** Decimal as string — format for display, never parse for storage. */
    inventoryValue: string
  } | null
  challans: { draft: number; confirmed: number; cancelled: number } | null
  recentChallans: Challan[] | null
  recentStockLogs: StockLog[] | null
}

/** Every dashboard figure in one request (replaces seven). */
export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: async () =>
      (await api.get<ApiEnvelope<DashboardSummary>>('/dashboard/summary')).data.data,
    // The free-tier DB is small and these figures change slowly; avoid
    // re-hitting it on every window focus.
    staleTime: 60_000,
  })
}
