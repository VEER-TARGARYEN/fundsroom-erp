import { Router } from 'express'
import {
  listPurchaseOrders,
  getPurchaseOrder,
  createPo,
  sendPo,
  cancelPo,
  receive,
  stats,
  outstanding,
  reconcile,
} from '../controllers/purchaseOrder.controller'
import { authenticate, checkRole } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { idParamSchema } from '../schemas/common.schema'
import {
  createPurchaseOrderSchema,
  listPurchaseOrderQuerySchema,
  receiveGoodsSchema,
  outstandingQuerySchema,
} from '../schemas/purchaseOrder.schema'

const router = Router()

/**
 * Purchasing is a procurement/warehouse function, so SALES is excluded
 * entirely — it has no bearing on their work and purchase costs are commercially
 * sensitive. ACCOUNTS reads (payables live here) but cannot raise orders or
 * receive goods; only ADMIN and WAREHOUSE can do either.
 */
const CAN_VIEW = checkRole('ADMIN', 'WAREHOUSE', 'ACCOUNTS')
const CAN_MANAGE = checkRole('ADMIN', 'WAREHOUSE')

router.use(authenticate)

/**
 * @openapi
 * /purchase-orders/stats:
 *   get:
 *     tags: [Purchasing]
 *     summary: Counts by status, open order value, and overdue count
 *     responses:
 *       200: { description: Purchasing headline figures }
 *       403: { description: Role not permitted }
 */
router.get('/stats', CAN_VIEW, stats)

/**
 * @openapi
 * /purchase-orders/outstanding:
 *   get:
 *     tags: [Purchasing]
 *     summary: Quantity still inbound per product
 *     parameters:
 *       - { in: query, name: onlyBelowMin, schema: { type: string, enum: ['true','false'] } }
 *     responses:
 *       200: { description: Products with quantity on order }
 */
router.get('/outstanding', CAN_VIEW, validate({ query: outstandingQuerySchema }), outstanding)

/**
 * @openapi
 * /purchase-orders/reconcile:
 *   get:
 *     tags: [Purchasing]
 *     summary: Audit cached received quantities against goods-receipt rows
 *     responses:
 *       200: { description: Reconciliation result; consistent should always be true }
 */
router.get('/reconcile', CAN_VIEW, reconcile)

/**
 * @openapi
 * /purchase-orders/receive:
 *   post:
 *     tags: [Purchasing]
 *     summary: Record a goods receipt — the only path that increases stock
 *     responses:
 *       201: { description: Receipt recorded; stock incremented and logged }
 *       400: { description: Over-receipt, or order not yet sent }
 *       409: { description: Order cancelled or already fully received }
 *       403: { description: Role not permitted }
 */
router.post('/receive', CAN_MANAGE, validate({ body: receiveGoodsSchema }), receive)

/**
 * @openapi
 * /purchase-orders:
 *   get:
 *     tags: [Purchasing]
 *     summary: List purchase orders
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *       - { in: query, name: status, schema: { type: string, enum: [DRAFT, SENT, PARTIALLY_RECEIVED, RECEIVED, CANCELLED] } }
 *       - { in: query, name: overdue, schema: { type: string, enum: ['true','false'] } }
 *     responses:
 *       200: { description: A page of purchase orders }
 *   post:
 *     tags: [Purchasing]
 *     summary: Create a DRAFT purchase order (ADMIN, WAREHOUSE)
 *     responses:
 *       201: { description: Purchase order created }
 *       404: { description: Supplier or product not found }
 */
router.get('/', CAN_VIEW, validate({ query: listPurchaseOrderQuerySchema }), listPurchaseOrders)
router.post('/', CAN_MANAGE, validate({ body: createPurchaseOrderSchema }), createPo)

/**
 * @openapi
 * /purchase-orders/{id}:
 *   get:
 *     tags: [Purchasing]
 *     summary: One purchase order with its lines and receipt history
 *     responses:
 *       200: { description: Purchase order detail }
 *       404: { description: Not found }
 */
router.get('/:id', CAN_VIEW, validate({ params: idParamSchema }), getPurchaseOrder)

/**
 * @openapi
 * /purchase-orders/{id}/send:
 *   post:
 *     tags: [Purchasing]
 *     summary: DRAFT to SENT — commit the order to the supplier
 *     responses:
 *       200: { description: Order sent }
 *       409: { description: Already sent, or cancelled }
 */
router.post('/:id/send', CAN_MANAGE, validate({ params: idParamSchema }), sendPo)

/**
 * @openapi
 * /purchase-orders/{id}/cancel:
 *   post:
 *     tags: [Purchasing]
 *     summary: Cancel an order that has not received any goods
 *     responses:
 *       200: { description: Order cancelled }
 *       409: { description: Already cancelled, or goods already received }
 */
router.post('/:id/cancel', CAN_MANAGE, validate({ params: idParamSchema }), cancelPo)

export default router
