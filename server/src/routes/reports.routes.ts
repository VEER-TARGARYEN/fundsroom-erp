import { Router } from 'express'
import {
  reportsSummary,
  exportProductsCsv,
  exportSalesCsv,
} from '../controllers/reports.controller'
import { authenticate } from '../middleware/auth'

const router = Router()

/**
 * @openapi
 * /reports/summary:
 *   get:
 *     tags: [Reports]
 *     summary: Aggregated sales and inventory analytics
 *     description: >
 *       All figures are computed in the database over the full table, not a
 *       page of it. Sections the caller's role may not see are null.
 *     responses:
 *       200: { description: Aggregated analytics }
 *       401: { description: Not authenticated }
 */
router.get('/summary', authenticate, reportsSummary)

/**
 * @openapi
 * /reports/products.csv:
 *   get:
 *     tags: [Reports]
 *     summary: Full product catalogue as CSV (ADMIN, SALES, WAREHOUSE)
 *     responses:
 *       200: { description: CSV attachment }
 *       403: { description: Role not permitted }
 */
router.get('/products.csv', authenticate, exportProductsCsv)

/**
 * @openapi
 * /reports/sales.csv:
 *   get:
 *     tags: [Reports]
 *     summary: All confirmed challans as CSV (ADMIN, SALES, ACCOUNTS)
 *     responses:
 *       200: { description: CSV attachment }
 *       403: { description: Role not permitted }
 */
router.get('/sales.csv', authenticate, exportSalesCsv)

export default router
