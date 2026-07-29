import { Router } from 'express'
import { listStockLogs } from '../controllers/stockLog.controller'
import { authenticate, checkRole } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { listStockLogQuerySchema } from '../schemas/stockLog.schema'

const router = Router()

/**
 * @openapi
 * /stock-logs:
 *   get:
 *     tags: [Stock Logs]
 *     summary: List stock movements (ADMIN, WAREHOUSE only)
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: productId, schema: { type: string, format: uuid } }
 *       - { in: query, name: movementType, schema: { type: string, enum: [PURCHASE_IN, CHALLAN_OUT, MANUAL_ADJUST] } }
 *     responses:
 *       200: { description: A page of stock movements }
 *       403: { description: Role not permitted }
 */
router.get(
  '/',
  authenticate,
  checkRole('ADMIN', 'WAREHOUSE'),
  validate({ query: listStockLogQuerySchema }),
  listStockLogs,
)

export default router
