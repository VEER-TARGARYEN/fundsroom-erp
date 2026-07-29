import type {
  ChallanStatus,
  CustomerStatus,
  CustomerType,
  MovementType,
  Product,
} from '@/types/api'

type Tone = 'neutral' | 'indigo' | 'success' | 'warning' | 'error'

export const CUSTOMER_STATUS: Record<CustomerStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  LEAD: { label: 'Lead', tone: 'indigo' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
}

export const CUSTOMER_TYPE: Record<CustomerType, { label: string; tone: Tone }> = {
  WHOLESALE: { label: 'Wholesale', tone: 'indigo' },
  RETAIL: { label: 'Retail', tone: 'neutral' },
}

export const CHALLAN_STATUS: Record<ChallanStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'error' },
}

export const MOVEMENT: Record<MovementType, { label: string; tone: Tone }> = {
  PURCHASE_IN: { label: 'PURCHASE_IN', tone: 'success' },
  CHALLAN_OUT: { label: 'CHALLAN_OUT', tone: 'indigo' },
  MANUAL_ADJUST: { label: 'MANUAL_ADJUST', tone: 'warning' },
}

export type StockStatusKey = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'

export function stockStatus(p: Pick<Product, 'stockQuantity' | 'minStock'>): {
  key: StockStatusKey
  label: string
  tone: Tone
} {
  if (p.stockQuantity <= 0) return { key: 'OUT_OF_STOCK', label: 'Out of Stock', tone: 'neutral' }
  if (p.stockQuantity <= p.minStock) return { key: 'LOW_STOCK', label: 'Low Stock', tone: 'error' }
  return { key: 'IN_STOCK', label: 'In Stock', tone: 'success' }
}

export const CATEGORIES = [
  'Electronics',
  'Groceries',
  'Apparel',
  'Hardware',
  'Stationery',
  'Beverages',
  'Packaging',
]

export const WAREHOUSES = ['Mumbai Hub', 'Delhi DC', 'Bengaluru DC']
