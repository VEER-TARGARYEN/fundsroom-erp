import { Router } from 'express'
import {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
} from '../controllers/purchaseOrder.controller'
import { authenticate, checkRole } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { idParamSchema } from '../schemas/common.schema'
import {
  createSupplierSchema,
  updateSupplierSchema,
  listSupplierQuerySchema,
} from '../schemas/purchaseOrder.schema'

const router = Router()

// Same access split as purchase orders: SALES excluded, ACCOUNTS read-only.
router.use(authenticate)
const CAN_VIEW = checkRole('ADMIN', 'WAREHOUSE', 'ACCOUNTS')
const CAN_MANAGE = checkRole('ADMIN', 'WAREHOUSE')

/**
 * @openapi
 * /suppliers:
 *   get:
 *     tags: [Purchasing]
 *     summary: List suppliers
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: isActive, schema: { type: string, enum: ['true','false'] } }
 *     responses:
 *       200: { description: A page of suppliers }
 *   post:
 *     tags: [Purchasing]
 *     summary: Create a supplier (ADMIN, WAREHOUSE)
 *     responses:
 *       201: { description: Supplier created }
 */
router.get('/', CAN_VIEW, validate({ query: listSupplierQuerySchema }), listSuppliers)
router.post('/', CAN_MANAGE, validate({ body: createSupplierSchema }), createSupplier)

/**
 * @openapi
 * /suppliers/{id}:
 *   get:
 *     tags: [Purchasing]
 *     summary: One supplier with recent purchase orders
 *     responses:
 *       200: { description: Supplier detail }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Purchasing]
 *     summary: Update a supplier (ADMIN, WAREHOUSE)
 *     responses:
 *       200: { description: Supplier updated }
 */
router.get('/:id', CAN_VIEW, validate({ params: idParamSchema }), getSupplier)
router.patch(
  '/:id',
  CAN_MANAGE,
  validate({ params: idParamSchema, body: updateSupplierSchema }),
  updateSupplier,
)

export default router
