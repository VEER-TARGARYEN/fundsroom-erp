import { Router, type RequestHandler } from 'express'
import { scan, agentStatus } from '../controllers/notification.controller'
import { authenticate } from '../middleware/auth'

const router = Router()

/**
 * The scan endpoint serves both an unattended scheduler and a signed-in admin.
 * When the secret header is present we skip JWT authentication and let the
 * controller verify the secret in constant time; a wrong secret then falls
 * through to the "no user" branch and is rejected. Everything else must carry
 * a normal bearer token.
 */
const authUnlessSecret: RequestHandler = (req, res, next) => {
  if (req.header('x-agent-secret')) return next()
  return authenticate(req, res, next)
}

/**
 * @openapi
 * /agent/scan:
 *   post:
 *     tags: [Agent]
 *     summary: Run the alert detection cycle
 *     description: >
 *       Authenticate either with a bearer token (ADMIN only) or with the
 *       `x-agent-secret` header for scheduled runs. Scheduled runs send email;
 *       manual runs from the UI do not.
 *     responses:
 *       200: { description: Scan result }
 *       401: { description: Not authenticated }
 *       403: { description: Not an administrator }
 */
router.post('/scan', authUnlessSecret, scan)

/**
 * @openapi
 * /agent/status:
 *   get:
 *     tags: [Agent]
 *     summary: Which agent capabilities are configured
 *     responses:
 *       200: { description: Capability flags }
 */
router.get('/status', authenticate, agentStatus)

export default router
