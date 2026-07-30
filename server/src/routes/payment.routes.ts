import { Router } from 'express'
import {
  createPayment,
  listPayments,
  removePayment,
  receivables,
  listOpenInvoices,
} from '../controllers/payment.controller'
import { authenticate, checkRole } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { idParamSchema } from '../schemas/common.schema'
import {
  recordPaymentSchema,
  listPaymentQuerySchema,
  openInvoiceQuerySchema,
} from '../schemas/payment.schema'

const router = Router()

router.use(authenticate)

/**
 * @openapi
 * /payments/receivables:
 *   get:
 *     tags: [Payments]
 *     summary: Aging buckets, collection stats and top debtors
 *     responses:
 *       200: { description: Receivables overview }
 *       403: { description: Role not permitted }
 */
router.get('/receivables', checkRole('ADMIN', 'ACCOUNTS', 'SALES'), receivables)

/**
 * @openapi
 * /payments/open-invoices:
 *   get:
 *     tags: [Payments]
 *     summary: Unsettled confirmed challans, oldest first
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *       - { in: query, name: customerId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: A page of open invoices }
 */
router.get(
  '/open-invoices',
  checkRole('ADMIN', 'ACCOUNTS', 'SALES'),
  validate({ query: openInvoiceQuerySchema }),
  listOpenInvoices,
)

/**
 * @openapi
 * /payments:
 *   get:
 *     tags: [Payments]
 *     summary: Receipt history
 *     responses:
 *       200: { description: A page of payments }
 *   post:
 *     tags: [Payments]
 *     summary: Record a receipt against a confirmed challan (ADMIN, ACCOUNTS)
 *     responses:
 *       201: { description: Payment recorded }
 *       400: { description: Overpayment, already settled, or challan not payable }
 *       403: { description: Role not permitted }
 */
router.get(
  '/',
  checkRole('ADMIN', 'ACCOUNTS', 'SALES'),
  validate({ query: listPaymentQuerySchema }),
  listPayments,
)
// Recording money is restricted to accounts and admin — sales can see the
// ledger but must not book receipts.
router.post('/', checkRole('ADMIN', 'ACCOUNTS'), validate({ body: recordPaymentSchema }), createPayment)

/**
 * @openapi
 * /payments/{id}:
 *   delete:
 *     tags: [Payments]
 *     summary: Reverse a mistaken receipt (ADMIN only)
 *     responses:
 *       200: { description: Reversed }
 *       404: { description: Not found }
 */
router.delete('/:id', checkRole('ADMIN'), validate({ params: idParamSchema }), removePayment)

export default router
