import { z } from 'zod'
import { paginationSchema } from './common.schema'

export const listStockLogQuerySchema = paginationSchema.extend({
  productId: z.uuid().optional(),
  movementType: z.enum(['PURCHASE_IN', 'CHALLAN_OUT', 'MANUAL_ADJUST']).optional(),
})

export type ListStockLogQuery = z.infer<typeof listStockLogQuerySchema>
