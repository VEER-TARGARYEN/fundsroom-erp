import { Router } from 'express'
import {
  listChallans,
  getChallan,
  createChallan,
  confirmChallan,
  cancelChallan,
} from '../controllers/challan.controller'
import { authenticate, checkRole } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { idParamSchema } from '../schemas/common.schema'
import { createChallanSchema, listChallanQuerySchema } from '../schemas/challan.schema'

const router = Router()

// Challans expose financial totals, so WAREHOUSE is excluded entirely.
router.use(authenticate, checkRole('ADMIN', 'SALES', 'ACCOUNTS'))

/**
 * @openapi
 * /challans:
 *   get:
 *     tags: [Challans]
 *     summary: List challans (paginated; WAREHOUSE has no access)
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [DRAFT, CONFIRMED, CANCELLED] } }
 *     responses:
 *       200: { description: A page of challans }
 *   post:
 *     tags: [Challans]
 *     summary: Create a DRAFT challan (ADMIN, SALES)
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/CreateChallanInput' } } }
 *     responses:
 *       201: { description: Draft created }
 *       400: { description: Validation / product not found }
 */
router
  .route('/')
  .get(validate({ query: listChallanQuerySchema }), listChallans)
  .post(checkRole('ADMIN', 'SALES'), validate({ body: createChallanSchema }), createChallan)

/**
 * @openapi
 * /challans/{id}:
 *   get:
 *     tags: [Challans]
 *     summary: Get a challan (with snapshot line items)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: The challan }, 404: { description: Not found } }
 */
router.get('/:id', validate({ params: idParamSchema }), getChallan)

/**
 * @openapi
 * /challans/{id}/confirm:
 *   post:
 *     tags: [Challans]
 *     summary: Confirm a challan — atomically deduct stock (DRAFT -> CONFIRMED)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Confirmed; stock deducted }
 *       400:
 *         description: Insufficient stock — payload lists every shortfall item
 *         content: { application/json: { schema: { $ref: '#/components/schemas/InsufficientStockError' } } }
 *       409: { description: Already confirmed / cancelled }
 */
router.post('/:id/confirm', validate({ params: idParamSchema }), confirmChallan)

/**
 * @openapi
 * /challans/{id}/cancel:
 *   post:
 *     tags: [Challans]
 *     summary: Cancel a challan (reverses stock if it was confirmed)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Cancelled }
 *       409: { description: Already cancelled }
 */
router.post('/:id/cancel', validate({ params: idParamSchema }), cancelChallan)

export default router
