import { z } from 'zod'
import { paginationSchema } from './common.schema'

export const PO_STATUSES = [
  'DRAFT',
  'SENT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const

// ── Suppliers ───────────────────────────────────────────────────────────────

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2, 'Supplier name is required').max(120),
  contactPerson: z.string().trim().min(2, 'Contact person is required').max(120),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  email: z.email('Enter a valid email').optional().or(z.literal('')),
  // 15 characters, the standard GSTIN shape. Optional — small suppliers may be
  // unregistered, and rejecting them would be wrong.
  gstin: z
    .string()
    .trim()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format')
    .optional()
    .or(z.literal('')),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  notes: z.string().trim().max(500).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits').optional().or(z.literal('')),
})

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>

export const listSupplierQuerySchema = paginationSchema.extend({
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
})

export type ListSupplierQuery = z.infer<typeof listSupplierQuerySchema>

// ── Purchase orders ─────────────────────────────────────────────────────────

export const createPurchaseOrderSchema = z.object({
  supplierId: z.uuid('A supplier is required'),
  items: z
    .array(
      z.object({
        productId: z.uuid('Invalid product'),
        quantity: z.coerce.number().int().positive('Quantity must be at least 1').max(1_000_000),
        /**
         * What we agreed to pay per unit. Bounded above so a mistyped cost
         * can't book a fantasy liability; zero is allowed for free replacements
         * from a supplier, which do genuinely happen.
         */
        unitCost: z.coerce.number().min(0, 'Cost cannot be negative').max(10_000_000),
      }),
    )
    .min(1, 'A purchase order needs at least one line'),
  expectedDate: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Invalid date'),
  notes: z.string().trim().max(500).optional(),
})

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>

export const listPurchaseOrderQuerySchema = paginationSchema.extend({
  status: z.enum(PO_STATUSES).optional(),
  supplierId: z.uuid().optional(),
  /** `?overdue=true` — sent but past the expected delivery date. */
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export type ListPurchaseOrderQuery = z.infer<typeof listPurchaseOrderQuerySchema>

// ── Goods receipts ──────────────────────────────────────────────────────────

export const receiveGoodsSchema = z.object({
  purchaseOrderId: z.uuid('A purchase order is required'),
  items: z
    .array(
      z.object({
        purchaseOrderItemId: z.uuid('Invalid order line'),
        quantityReceived: z.coerce
          .number()
          .int()
          .positive('Received quantity must be at least 1')
          .max(1_000_000),
      }),
    )
    .min(1, 'Select at least one line to receive'),
  supplierRef: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  /** Defaults to now. Cannot be in the future — the goods have not arrived yet. */
  receivedAt: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Invalid date')
    .refine(
      (v) => !v || Date.parse(v) <= Date.now() + 86_400_000,
      'Receipt date cannot be in the future',
    ),
})

export type ReceiveGoodsInput = z.infer<typeof receiveGoodsSchema>

export const outstandingQuerySchema = z.object({
  onlyBelowMin: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export type OutstandingQuery = z.infer<typeof outstandingQuerySchema>
