import { Router } from 'express'
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  adjustProductStock,
} from '../controllers/product.controller'
import { authenticate, checkRole } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { idParamSchema } from '../schemas/common.schema'
import {
  createProductSchema,
  updateProductSchema,
  adjustStockSchema,
  listProductQuerySchema,
} from '../schemas/product.schema'

const router = Router()
router.use(authenticate)

/**
 * @openapi
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: List products (paginated; category + lowStock filters)
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: category, schema: { type: string } }
 *       - { in: query, name: lowStock, schema: { type: string, enum: [true, false] } }
 *     responses:
 *       200: { description: A page of products }
 *   post:
 *     tags: [Products]
 *     summary: Create a product (ADMIN, WAREHOUSE)
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/CreateProductInput' } } }
 *     responses:
 *       201: { description: Created }
 */
router
  .route('/')
  .get(checkRole('ADMIN', 'SALES', 'WAREHOUSE'), validate({ query: listProductQuerySchema }), listProducts)
  .post(checkRole('ADMIN', 'WAREHOUSE'), validate({ body: createProductSchema }), createProduct)

/**
 * @openapi
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get a product by id
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: The product }, 404: { description: Not found } }
 *   patch:
 *     tags: [Products]
 *     summary: Update a product (ADMIN, WAREHOUSE)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Updated } }
 */
router
  .route('/:id')
  .get(checkRole('ADMIN', 'SALES', 'WAREHOUSE'), validate({ params: idParamSchema }), getProduct)
  .patch(
    checkRole('ADMIN', 'WAREHOUSE'),
    validate({ params: idParamSchema, body: updateProductSchema }),
    updateProduct,
  )

/**
 * @openapi
 * /products/{id}/adjust-stock:
 *   post:
 *     tags: [Products]
 *     summary: Manually adjust stock (MANUAL_ADJUST) — ADMIN, WAREHOUSE only
 *     description: SALES is intentionally forbidden; sales stock movement must go through a challan.
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/AdjustStockInput' } } }
 *     responses:
 *       200: { description: Adjusted product }
 *       400: { description: Would drive stock negative }
 *       403: { description: Role not permitted }
 */
router.post(
  '/:id/adjust-stock',
  checkRole('ADMIN', 'WAREHOUSE'),
  validate({ params: idParamSchema, body: adjustStockSchema }),
  adjustProductStock,
)

export default router
