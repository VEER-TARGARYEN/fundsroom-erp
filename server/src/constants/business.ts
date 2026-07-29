import { Prisma } from '@prisma/client'

/** GST applied to every challan (18%). Kept as Decimal to avoid float drift. */
export const GST_RATE = new Prisma.Decimal('0.18')

/** Prefix for generated challan numbers, e.g. CH-2026-00001. */
export const CHALLAN_PREFIX = 'CH'

/** Postgres sequence backing atomic, collision-free challan numbering. */
export const CHALLAN_SEQUENCE = 'challan_number_seq'

/** Default & max page sizes for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
