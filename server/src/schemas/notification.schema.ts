import { z } from 'zod'
import { paginationSchema } from './common.schema'

const NOTIFICATION_TYPES = ['OUT_OF_STOCK', 'LOW_STOCK', 'DRAFT_STALE', 'FOLLOW_UP_DUE'] as const

export const listNotificationQuerySchema = paginationSchema.extend({
  /** `?unread=true` restricts to alerts that have not been read yet. */
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  /**
   * Comma-separated type filter, e.g. `?types=LOW_STOCK,DRAFT_STALE`. Applied
   * server-side so pagination counts stay correct — filtering the current page
   * in the browser would report totals for rows it had already excluded.
   */
  types: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter((s): s is (typeof NOTIFICATION_TYPES)[number] =>
              (NOTIFICATION_TYPES as readonly string[]).includes(s),
            )
        : undefined,
    ),
})

export type ListNotificationQuery = z.infer<typeof listNotificationQuerySchema>
