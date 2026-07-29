import { z } from 'zod'
import { paginationSchema } from './common.schema'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const createChallanSchema = z.object({
  customerId: z.uuid('A valid customerId is required'),
  date: z.string().regex(DATE_RE, 'Must be YYYY-MM-DD').optional(),
  items: z
    .array(
      z.object({
        productId: z.uuid('A valid productId is required'),
        quantity: z.coerce.number().int().positive('Quantity must be greater than 0'),
      }),
    )
    .min(1, 'A challan must have at least one line item'),
})

export const listChallanQuerySchema = paginationSchema.extend({
  status: z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED']).optional(),
  customerId: z.uuid().optional(),
})

export type CreateChallanInput = z.infer<typeof createChallanSchema>
export type ListChallanQuery = z.infer<typeof listChallanQuerySchema>
