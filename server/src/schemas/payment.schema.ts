import { z } from 'zod'
import { paginationSchema } from './common.schema'

export const PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'UPI',
  'CHEQUE',
  'CARD',
  'ADJUSTMENT',
] as const

export const recordPaymentSchema = z.object({
  challanId: z.uuid('A challan is required'),
  /**
   * Bounded above so a stray keypress can't book a fantasy receipt; the real
   * ceiling is the challan's outstanding balance, checked transactionally.
   */
  amount: z.coerce
    .number()
    .positive('Amount must be greater than zero')
    .max(1_000_000_000, 'Amount looks implausible'),
  method: z.enum(PAYMENT_METHODS).default('BANK_TRANSFER'),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  /** Defaults to now. Cannot be in the future — a receipt hasn't happened yet. */
  paidAt: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Invalid date')
    .refine(
      (v) => !v || Date.parse(v) <= Date.now() + 86_400_000,
      'Payment date cannot be in the future',
    ),
})

export type RecordPaymentBody = z.infer<typeof recordPaymentSchema>

export const listPaymentQuerySchema = paginationSchema.extend({
  challanId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
})

export type ListPaymentQuery = z.infer<typeof listPaymentQuerySchema>

export const openInvoiceQuerySchema = paginationSchema.extend({
  customerId: z.uuid().optional(),
})

export type OpenInvoiceQuery = z.infer<typeof openInvoiceQuerySchema>
