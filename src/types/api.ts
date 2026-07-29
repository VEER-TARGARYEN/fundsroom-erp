// Types mirroring the Express + Prisma backend (fundsroom-erp/server).
// Money fields arrive as strings (Prisma Decimal -> JSON) — never parse as float
// for storage; format for display only.

export type Role = 'ADMIN' | 'SALES' | 'WAREHOUSE' | 'ACCOUNTS'
export type CustomerType = 'WHOLESALE' | 'RETAIL'
export type CustomerStatus = 'ACTIVE' | 'LEAD' | 'INACTIVE'
export type MovementType = 'PURCHASE_IN' | 'CHALLAN_OUT' | 'MANUAL_ADJUST'
export type ChallanStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: Role
}

export interface Customer {
  id: string
  businessName: string
  contactPerson: string
  mobile: string
  email: string | null
  gstin: string | null
  type: CustomerType
  status: CustomerStatus
  notes: string | null
  followUpDate: string | null
  addressLine1: string | null
  city: string | null
  state: string | null
  pincode: string | null
  createdAt: string
  updatedAt: string
  challans?: Challan[]
}

export interface Product {
  id: string
  sku: string
  name: string
  category: string
  unitPrice: string
  stockQuantity: number
  minStock: number
  warehouseLocation: string
  createdAt: string
  updatedAt: string
}

export interface StockLog {
  id: string
  productId: string
  quantityChange: number
  movementType: MovementType
  reason: string
  userId: string
  createdAt: string
  product?: { sku: string; name: string }
  user?: { name: string }
}

export interface ChallanItem {
  id: string
  challanId: string
  productId: string
  productNameSnapshot: string
  skuSnapshot: string
  unitPriceSnapshot: string
  quantity: number
  lineTotal: string
}

export interface Challan {
  id: string
  challanNumber: string
  customerId: string
  subtotal: string
  taxAmount: string
  totalAmount: string
  status: ChallanStatus
  createdById: string
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
  items?: ChallanItem[]
  customer?: Pick<Customer, 'id' | 'businessName' | 'contactPerson' | 'gstin' | 'addressLine1' | 'city' | 'state' | 'pincode'>
  createdBy?: { id: string; name: string }
  _count?: { items: number }
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface Paginated<T> {
  data: T[]
  pagination: PaginationMeta
}

export interface ApiEnvelope<T> {
  data: T
  message?: string
}

/** Normalized error shape thrown by the api client. */
export interface ApiError {
  status: number
  code: string
  message: string
  details?: unknown
}

/** Payload for a 400 INSUFFICIENT_STOCK response from confirmChallan. */
export interface InsufficientStockItem {
  productId: string
  sku: string | null
  name: string | null
  requested: number
  available: number
  reason: string
}
