import { z } from 'zod'
import { paginationSchema } from './common.schema'

export const createProductSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').toUpperCase(),
  name: z.string().trim().min(1, 'Product name is required'),
  category: z.string().trim().min(1, 'Category is required'),
  unitPrice: z.coerce.number().positive('Unit price must be greater than 0'),
  stockQuantity: z.coerce.number().int().min(0, 'Stock cannot be negative').default(0),
  minStock: z.coerce.number().int().min(0, 'Minimum stock cannot be negative').default(0),
  warehouseLocation: z.string().trim().min(1, 'Warehouse is required'),
})

// stockQuantity is intentionally NOT updatable here — all stock mutation must go
// through the locked, audited adjust-stock / challan paths (never a blind PATCH).
export const updateProductSchema = createProductSchema
  .omit({ stockQuantity: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })

/**
 * Manual stock adjustment (MANUAL_ADJUST). `quantityChange` is signed:
 * positive adds stock, negative removes it. Zero is rejected.
 */
export const adjustStockSchema = z.object({
  quantityChange: z.coerce
    .number()
    .int()
    .refine((n) => n !== 0, 'quantityChange cannot be zero'),
  reason: z.string().trim().min(1, 'A reason is required for manual adjustments'),
})

export const listProductQuerySchema = paginationSchema.extend({
  category: z.string().trim().optional(),
  // ?lowStock=true → only products at or below their minimum stock.
  lowStock: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
export type AdjustStockInput = z.infer<typeof adjustStockSchema>
export type ListProductQuery = z.infer<typeof listProductQuerySchema>
