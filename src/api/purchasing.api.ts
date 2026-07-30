import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from './client'
import type { ApiEnvelope, Paginated } from '@/types/api'

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED'

export interface Supplier {
  id: string
  name: string
  contactPerson: string
  mobile: string
  email: string | null
  gstin: string | null
  paymentTermsDays: number
  isActive: boolean
  notes: string | null
  addressLine1: string | null
  city: string | null
  state: string | null
  pincode: string | null
  createdAt: string
  _count?: { purchaseOrders: number }
}

export interface PurchaseOrderItem {
  id: string
  productId: string
  productNameSnapshot: string
  skuSnapshot: string
  /** Decimal as string — format for display, never parse for storage. */
  unitCost: string
  orderedQuantity: number
  receivedQuantity: number
  lineTotal: string
}

export interface GoodsReceipt {
  id: string
  receiptNumber: string
  supplierRef: string | null
  notes: string | null
  receivedAt: string
  items: { id: string; purchaseOrderItemId: string; productId: string; quantityReceived: number }[]
  receivedBy?: { name: string }
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  supplierId: string
  status: PurchaseOrderStatus
  subtotal: string
  taxAmount: string
  totalAmount: string
  expectedDate: string | null
  notes: string | null
  sentAt: string | null
  closedAt: string | null
  createdAt: string
  supplier?: { id: string; name: string } | Supplier
  createdBy?: { id: string; name: string }
  items?: PurchaseOrderItem[]
  receipts?: GoodsReceipt[]
  _count?: { items: number; receipts: number }
}

export interface PurchasingStats {
  counts: Record<string, number>
  openOrders: number
  openValue: string
  overdueOrders: number
}

export interface OutstandingProduct {
  productId: string
  sku: string
  name: string
  stockQuantity: number
  minStock: number
  onOrder: number
}

// ── Suppliers ───────────────────────────────────────────────────────────────

export function useSuppliers(params: {
  page?: number
  limit?: number
  search?: string
  isActive?: boolean
}) {
  return useQuery({
    queryKey: ['suppliers', params],
    queryFn: async () =>
      (
        await api.get<Paginated<Supplier>>('/suppliers', {
          params: { ...params, isActive: params.isActive === undefined ? undefined : String(params.isActive) },
        })
      ).data,
    placeholderData: keepPreviousData,
  })
}

export interface SupplierInput {
  name: string
  contactPerson: string
  mobile: string
  email?: string
  gstin?: string
  paymentTermsDays?: number
  notes?: string
  addressLine1?: string
  city?: string
  state?: string
  pincode?: string
  isActive?: boolean
}

export function useCreateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SupplierInput) =>
      (await api.post<ApiEnvelope<Supplier>>('/suppliers', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useUpdateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: SupplierInput & { id: string }) =>
      (await api.patch<ApiEnvelope<Supplier>>(`/suppliers/${id}`, input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

// ── Purchase orders ─────────────────────────────────────────────────────────

export function usePurchaseOrders(params: {
  page?: number
  limit?: number
  search?: string
  status?: PurchaseOrderStatus
  overdue?: boolean
}) {
  return useQuery({
    queryKey: ['purchase-orders', params],
    queryFn: async () =>
      (
        await api.get<Paginated<PurchaseOrder>>('/purchase-orders', {
          params: { ...params, overdue: params.overdue ? 'true' : undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  })
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: ['purchase-orders', 'detail', id],
    queryFn: async () =>
      (await api.get<ApiEnvelope<PurchaseOrder>>(`/purchase-orders/${id}`)).data.data,
    enabled: !!id,
  })
}

export function usePurchasingStats() {
  return useQuery({
    queryKey: ['purchase-orders', 'stats'],
    queryFn: async () =>
      (await api.get<ApiEnvelope<PurchasingStats>>('/purchase-orders/stats')).data.data,
    staleTime: 60_000,
  })
}

export function useOutstandingOnOrder(onlyBelowMin = false) {
  return useQuery({
    queryKey: ['purchase-orders', 'outstanding', onlyBelowMin],
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<OutstandingProduct[]>>('/purchase-orders/outstanding', {
          params: { onlyBelowMin: onlyBelowMin ? 'true' : undefined },
        })
      ).data.data,
    staleTime: 60_000,
  })
}

/**
 * A goods receipt changes stock, the order, and the dashboard's low-stock
 * figures — invalidate all three rather than just the order being viewed.
 */
function invalidatePurchasing(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['purchase-orders'] })
  qc.invalidateQueries({ queryKey: ['products'] })
  qc.invalidateQueries({ queryKey: ['stock-logs'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}

export interface CreatePurchaseOrderInput {
  supplierId: string
  items: { productId: string; quantity: number; unitCost: number }[]
  expectedDate?: string
  notes?: string
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreatePurchaseOrderInput) =>
      (await api.post<ApiEnvelope<PurchaseOrder>>('/purchase-orders', input)).data.data,
    onSuccess: () => invalidatePurchasing(qc),
  })
}

export function useSendPurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<ApiEnvelope<PurchaseOrder>>(`/purchase-orders/${id}/send`)).data.data,
    onSuccess: () => invalidatePurchasing(qc),
  })
}

export function useCancelPurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<ApiEnvelope<PurchaseOrder>>(`/purchase-orders/${id}/cancel`)).data.data,
    onSuccess: () => invalidatePurchasing(qc),
  })
}

export interface ReceiveGoodsInput {
  purchaseOrderId: string
  items: { purchaseOrderItemId: string; quantityReceived: number }[]
  supplierRef?: string
  notes?: string
}

export function useReceiveGoods() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ReceiveGoodsInput) =>
      (
        await api.post<ApiEnvelope<GoodsReceipt & { purchaseOrder: PurchaseOrder }>>(
          '/purchase-orders/receive',
          input,
        )
      ).data.data,
    onSuccess: () => invalidatePurchasing(qc),
  })
}

export const PO_STATUS_META: Record<
  PurchaseOrderStatus,
  { label: string; tone: 'neutral' | 'indigo' | 'warning' | 'success' | 'error' }
> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SENT: { label: 'Sent', tone: 'indigo' },
  PARTIALLY_RECEIVED: { label: 'Part received', tone: 'warning' },
  RECEIVED: { label: 'Received', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'error' },
}
