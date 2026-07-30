import { Router } from 'express'
import authRoutes from './auth.routes'
import customerRoutes from './customer.routes'
import productRoutes from './product.routes'
import stockLogRoutes from './stockLog.routes'
import challanRoutes from './challan.routes'
import dashboardRoutes from './dashboard.routes'
import reportsRoutes from './reports.routes'
import notificationRoutes from './notification.routes'
import agentRoutes from './agent.routes'
import workspaceRoutes from './workspace.routes'
import aiRoutes from './ai.routes'
import { asyncHandler } from '../utils/asyncHandler'
import { prisma } from '../config/prisma'

const router = Router()

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Liveness / readiness probe (checks DB connectivity)
 *     security: []
 *     responses:
 *       200: { description: Service healthy }
 *       503: { description: Database unreachable }
 */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  }),
)

router.use('/auth', authRoutes)
router.use('/customers', customerRoutes)
router.use('/products', productRoutes)
router.use('/stock-logs', stockLogRoutes)
router.use('/challans', challanRoutes)
router.use('/dashboard', dashboardRoutes)
router.use('/reports', reportsRoutes)
router.use('/notifications', notificationRoutes)
router.use('/agent', agentRoutes)
router.use('/workspace', workspaceRoutes)
router.use('/ai', aiRoutes)

export default router
