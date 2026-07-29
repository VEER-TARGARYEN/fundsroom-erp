import { z } from 'zod'
import { paginationSchema } from './common.schema'

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const MOBILE_RE = /^[6-9]\d{9}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/ // YYYY-MM-DD

export const createCustomerSchema = z.object({
  businessName: z.string().trim().min(1, 'Business name is required'),
  contactPerson: z.string().trim().min(1, 'Contact person is required'),
  mobile: z.string().regex(MOBILE_RE, 'Enter a valid 10-digit mobile'),
  email: z.email('Enter a valid email').optional(),
  gstin: z.string().regex(GSTIN_RE, 'Enter a valid 15-character GSTIN').optional(),
  type: z.enum(['WHOLESALE', 'RETAIL']).default('WHOLESALE'),
  status: z.enum(['ACTIVE', 'LEAD', 'INACTIVE']).default('LEAD'),
  notes: z.string().trim().max(2000).optional(),
  followUpDate: z.string().regex(DATE_RE, 'Must be YYYY-MM-DD').optional(),
  addressLine1: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pincode: z.string().regex(/^\d{6}$/, '6-digit PIN').optional(),
})

// All fields optional for PATCH; at least one must be present.
export const updateCustomerSchema = createCustomerSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Provide at least one field to update' },
)

export const listCustomerQuerySchema = paginationSchema.extend({
  status: z.enum(['ACTIVE', 'LEAD', 'INACTIVE']).optional(),
  type: z.enum(['WHOLESALE', 'RETAIL']).optional(),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>
export type ListCustomerQuery = z.infer<typeof listCustomerQuerySchema>
