import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from './client'
import type { ApiEnvelope, Paginated, Product } from '@/types/api'

export interface ProductListParams {
  page?: number
  limit?: number
  search?: string
  category?: string
  lowStock?: 'true' | 'false'
}

export interface ProductInput {
  sku: string
  name: string
  category: string
  unitPrice: number
  stockQuantity?: number
  minStock?: number
  warehouseLocation: string
}

export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: async () => (await api.get<Paginated<Product>>('/products', { params })).data,
    placeholderData: keepPreviousData,
  })
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => (await api.get<ApiEnvelope<Product>>(`/products/${id}`)).data.data,
    enabled: !!id,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProductInput) =>
      (await api.post<ApiEnvelope<Product>>('/products', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<Omit<ProductInput, 'stockQuantity'>> }) =>
      (await api.patch<ApiEnvelope<Product>>(`/products/${id}`, input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

/** MANUAL_ADJUST — the only non-challan stock mutation (ADMIN/WAREHOUSE). */
export function useAdjustStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      quantityChange,
      reason,
    }: {
      id: string
      quantityChange: number
      reason: string
    }) =>
      (await api.post<ApiEnvelope<Product>>(`/products/${id}/adjust-stock`, { quantityChange, reason }))
        .data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['stock-logs'] })
    },
  })
}
