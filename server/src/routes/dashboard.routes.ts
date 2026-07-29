import { Router } from 'express'
import { dashboardSummary } from '../controllers/dashboard.controller'
import { authenticate } from '../middleware/auth'

const router = Router()

/**
 * @openapi
 * /dashboard/summary:
 *   get:
 *     tags: [Dashboard]
 *     summary: All dashboard KPIs and recent activity in a single request
 *     description: >
 *       Replaces seven separate client requests. Sections the caller's role may
 *       not see are returned as null rather than omitted, so the shape is stable.
 *     responses:
 *       200: { description: Aggregated dashboard summary }
 *       401: { description: Not authenticated }
 */
router.get('/summary', authenticate, dashboardSummary)

export default router
