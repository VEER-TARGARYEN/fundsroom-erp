import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from './client'
import type {
  ApiEnvelope,
  Customer,
  CustomerStatus,
  CustomerType,
  Paginated,
} from '@/types/api'

export interface CustomerListParams {
  page?: number
  limit?: number
  search?: string
  status?: CustomerStatus
  type?: CustomerType
}

export interface CustomerInput {
  businessName: string
  contactPerson: string
  mobile: string
  email?: string
  gstin?: string
  type?: CustomerType
  status?: CustomerStatus
  notes?: string
  followUpDate?: string
  addressLine1?: string
  city?: string
  state?: string
  pincode?: string
}

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: async () => (await api.get<Paginated<Customer>>('/customers', { params })).data,
    placeholderData: keepPreviousData,
  })
}

export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: async () => (await api.get<ApiEnvelope<Customer>>(`/customers/${id}`)).data.data,
    enabled: !!id,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CustomerInput) =>
      (await api.post<ApiEnvelope<Customer>>('/customers', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<CustomerInput> }) =>
      (await api.patch<ApiEnvelope<Customer>>(`/customers/${id}`, input)).data.data,
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer', id] })
    },
  })
}
