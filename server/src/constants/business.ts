import { Prisma } from '@prisma/client'

/** GST applied to every challan (18%). Kept as Decimal to avoid float drift. */
export const GST_RATE = new Prisma.Decimal('0.18')

/** Prefix for generated challan numbers, e.g. CH-2026-00001. */
export const CHALLAN_PREFIX = 'CH'

/** Postgres sequence backing atomic, collision-free challan numbering. */
export const CHALLAN_SEQUENCE = 'challan_number_seq'

/** Prefix for generated purchase-order numbers, e.g. PO-2026-00001. */
export const PO_PREFIX = 'PO'
export const PO_SEQUENCE = 'po_number_seq'

/** Prefix for goods received notes, e.g. GRN-2026-00001. */
export const GRN_PREFIX = 'GRN'
export const GRN_SEQUENCE = 'grn_number_seq'

/**
 * A DRAFT purchase order older than this is chased by the operations agent —
 * the purchasing mirror of DRAFT_STALE on the sales side.
 */
export const PO_STALE_DAYS = 5

/** Default & max page sizes for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
