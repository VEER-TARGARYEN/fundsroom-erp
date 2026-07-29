import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { ApiEnvelope } from '@/types/api'

/** A single chart row. `value` is a Decimal string — format, never parse for storage. */
export interface ReportBucket {
  label: string
  value: string
}

export interface ReportsSummary {
  products: {
    total: number
    lowStock: number
    inventoryValue: string
    byCategory: ReportBucket[]
    topByStockValue: ReportBucket[]
  } | null
  sales: {
    value: string
    confirmed: number
    draft: number
    cancelled: number
    topCustomers: ReportBucket[]
  } | null
}

/**
 * Analytics aggregated server-side over the full tables. The page previously
 * summed a single 100-row page in the browser, which under-reported totals and
 * disagreed with the dashboard once the catalogue grew.
 */
export function useReportsSummary() {
  return useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: async () => (await api.get<ApiEnvelope<ReportsSummary>>('/reports/summary')).data.data,
    staleTime: 60_000,
  })
}
