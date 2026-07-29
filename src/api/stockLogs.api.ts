import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api } from './client'
import type { MovementType, Paginated, StockLog } from '@/types/api'

export interface StockLogListParams {
  page?: number
  limit?: number
  search?: string
  productId?: string
  movementType?: MovementType
}

export function useStockLogs(params: StockLogListParams) {
  return useQuery({
    queryKey: ['stock-logs', params],
    queryFn: async () => (await api.get<Paginated<StockLog>>('/stock-logs', { params })).data,
    placeholderData: keepPreviousData,
  })
}
