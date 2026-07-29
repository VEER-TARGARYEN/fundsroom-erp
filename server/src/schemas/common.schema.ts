import { z } from 'zod'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/business'

/** :id path param — must be a UUID. */
export const idParamSchema = z.object({
  id: z.uuid('Invalid id'),
})

/** Shared pagination + free-text search for list endpoints. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().min(1).optional(),
})

export type Pagination = z.infer<typeof paginationSchema>

/** Build a Prisma-friendly { skip, take } from validated pagination. */
export function toSkipTake(p: { page: number; limit: number }) {
  return { skip: (p.page - 1) * p.limit, take: p.limit }
}

/** Standard pagination envelope for list responses. */
export function paginationMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
}
