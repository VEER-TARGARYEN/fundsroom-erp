import { Router } from 'express'
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
} from '../controllers/customer.controller'
import { authenticate, checkRole } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { idParamSchema } from '../schemas/common.schema'
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomerQuerySchema,
} from '../schemas/customer.schema'

const router = Router()

// CRM is visible to ADMIN, SALES and ACCOUNTS. WAREHOUSE has no access.
router.use(authenticate)

/**
 * @openapi
 * /customers:
 *   get:
 *     tags: [Customers]
 *     summary: List customers (paginated, searchable, filterable)
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [ACTIVE, LEAD, INACTIVE] } }
 *       - { in: query, name: type, schema: { type: string, enum: [WHOLESALE, RETAIL] } }
 *     responses:
 *       200: { description: A page of customers }
 *   post:
 *     tags: [Customers]
 *     summary: Create a customer
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/CreateCustomerInput' } } }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 */
router
  .route('/')
  .get(checkRole('ADMIN', 'SALES', 'ACCOUNTS'), validate({ query: listCustomerQuerySchema }), listCustomers)
  .post(checkRole('ADMIN', 'SALES'), validate({ body: createCustomerSchema }), createCustomer)

/**
 * @openapi
 * /customers/{id}:
 *   get:
 *     tags: [Customers]
 *     summary: Get a customer by id
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: The customer }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Customers]
 *     summary: Update a customer
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Updated }
 */
router
  .route('/:id')
  .get(checkRole('ADMIN', 'SALES', 'ACCOUNTS'), validate({ params: idParamSchema }), getCustomer)
  .patch(
    checkRole('ADMIN', 'SALES'),
    validate({ params: idParamSchema, body: updateCustomerSchema }),
    updateCustomer,
  )

export default router
