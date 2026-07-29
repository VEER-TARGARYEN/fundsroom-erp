import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from './client'
import type { ApiEnvelope, Challan, ChallanStatus, Paginated } from '@/types/api'

export interface ChallanListParams {
  page?: number
  limit?: number
  search?: string
  status?: ChallanStatus
  customerId?: string
}

export interface ChallanInput {
  customerId: string
  date?: string
  items: { productId: string; quantity: number }[]
}

export function useChallans(params: ChallanListParams) {
  return useQuery({
    queryKey: ['challans', params],
    queryFn: async () => (await api.get<Paginated<Challan>>('/challans', { params })).data,
    placeholderData: keepPreviousData,
  })
}

export function useChallan(id: string | null) {
  return useQuery({
    queryKey: ['challan', id],
    queryFn: async () => (await api.get<ApiEnvelope<Challan>>(`/challans/${id}`)).data.data,
    enabled: !!id,
  })
}

export function useCreateChallan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ChallanInput) =>
      (await api.post<ApiEnvelope<Challan>>('/challans', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challans'] }),
  })
}

function invalidateAfterStockMove(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['challans'] })
  qc.invalidateQueries({ queryKey: ['products'] })
  qc.invalidateQueries({ queryKey: ['stock-logs'] })
}

/** Confirm — atomic stock deduction. Rejects with ApiError(code INSUFFICIENT_STOCK). */
export function useConfirmChallan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<ApiEnvelope<Challan>>(`/challans/${id}/confirm`)).data.data,
    onSuccess: () => invalidateAfterStockMove(qc),
  })
}

export function useCancelChallan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<ApiEnvelope<Challan>>(`/challans/${id}/cancel`)).data.data,
    onSuccess: () => invalidateAfterStockMove(qc),
  })
}
