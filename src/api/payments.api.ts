import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from './client'
import type { ApiEnvelope, Paginated, PaginationMeta } from '@/types/api'

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'CARD' | 'ADJUSTMENT'

export interface Payment {
  id: string
  challanId: string
  customerId: string
  /** Decimal as string — format for display, never parse for storage. */
  amount: string
  method: PaymentMethod
  reference: string | null
  note: string | null
  paidAt: string
  createdAt: string
  challan?: { challanNumber: string; totalAmount: string }
  customer?: { businessName: string }
  createdBy?: { name: string }
}

export interface AgingBucket {
  key: string
  label: string
  invoices: number
  outstanding: string
}

export interface Receivables {
  aging: {
    buckets: AgingBucket[]
    totalOutstanding: string
    overdue: string
  }
  stats: {
    collectedThisMonth: string
    receiptsThisMonth: number
    collectedAllTime: string
    receiptsAllTime: number
    avgDaysToPay: number | null
  }
  topCustomers: {
    customerId: string
    businessName: string
    city: string | null
    state: string | null
    invoices: number
    outstanding: string
    oldestDays: number
  }[]
}

export interface OpenInvoice {
  challanId: string
  challanNumber: string
  customerId: string
  businessName: string
  confirmedAt: string | null
  total: string
  paid: string
  due: string
  ageDays: number
}

export interface ChallanPaymentSummary {
  challanId: string
  challanNumber: string
  status: string
  total: string
  paid: string
  outstanding: string
  settled: boolean
  payments: Payment[]
}

/** Aging, collection stats and top debtors in one request. */
export function useReceivables() {
  return useQuery({
    queryKey: ['payments', 'receivables'],
    queryFn: async () => (await api.get<ApiEnvelope<Receivables>>('/payments/receivables')).data.data,
    // A full aggregate over every invoice and receipt — expensive on the free
    // tier, and these figures move slowly. Don't re-run it on window focus.
    staleTime: 60_000,
  })
}

export function useOpenInvoices(params: { page?: number; limit?: number; customerId?: string }) {
  return useQuery({
    queryKey: ['payments', 'open-invoices', params],
    queryFn: async () =>
      (await api.get<{ data: OpenInvoice[]; pagination: PaginationMeta }>('/payments/open-invoices', {
        params,
      })).data,
    placeholderData: keepPreviousData,
  })
}

export function usePayments(params: {
  page?: number
  limit?: number
  search?: string
  challanId?: string
  customerId?: string
  method?: PaymentMethod
}) {
  return useQuery({
    queryKey: ['payments', 'list', params],
    queryFn: async () => (await api.get<Paginated<Payment>>('/payments', { params })).data,
    placeholderData: keepPreviousData,
  })
}

export function useChallanPaymentSummary(challanId: string | null) {
  return useQuery({
    queryKey: ['payments', 'challan-summary', challanId],
    queryFn: async () =>
      (await api.get<ApiEnvelope<ChallanPaymentSummary>>(`/challans/${challanId}/payment-summary`))
        .data.data,
    enabled: !!challanId,
  })
}

export interface RecordPaymentInput {
  challanId: string
  amount: number
  method: PaymentMethod
  reference?: string
  note?: string
  paidAt?: string
}

/** Everything a receipt changes: receivables, the worklist, and the challan. */
function invalidateMoney(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['payments'] })
  qc.invalidateQueries({ queryKey: ['challans'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RecordPaymentInput) =>
      (
        await api.post<
          ApiEnvelope<{
            payment: Payment
            challanTotal: string
            paid: string
            outstanding: string
            settled: boolean
          }>
        >('/payments', input)
      ).data.data,
    onSuccess: () => invalidateMoney(qc),
  })
}

export function useDeletePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/payments/${id}`)).data,
    onSuccess: () => invalidateMoney(qc),
  })
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  ADJUSTMENT: 'Adjustment',
}
