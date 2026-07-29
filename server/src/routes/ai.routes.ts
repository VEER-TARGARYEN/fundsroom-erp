import { Router } from 'express'
import { aiStatus, assistant } from '../controllers/ai.controller'
import { authenticate, checkRole } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { assistantSchema } from '../schemas/ai.schema'
import { aiLimiter } from '../middleware/rateLimit'

const router = Router()

router.use(authenticate)

/**
 * @openapi
 * /ai/status:
 *   get:
 *     tags: [AI]
 *     summary: Whether the AI assistant is configured/available
 *     responses:
 *       200: { description: "{ data: { enabled: boolean } }" }
 */
router.get('/status', aiStatus)

/**
 * @openapi
 * /ai/assistant:
 *   post:
 *     tags: [AI]
 *     summary: Ask the ERP copilot a question, grounded in live business data
 *     description: >
 *       Returns a structured answer with follow-up suggestions and metadata
 *       (tags, sentiment, confidence, reading time) plus grounding figures.
 *       WAREHOUSE role is excluded (surfaces CRM & financial data).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, example: "Which products need reordering?" }
 *               history:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role: { type: string, enum: [user, assistant] }
 *                     content: { type: string }
 *     responses:
 *       200: { description: Structured assistant response }
 *       403: { description: Role not permitted }
 *       502: { description: AI provider or output error }
 *       503: { description: AI not configured }
 */
router.post(
  '/assistant',
  checkRole('ADMIN', 'SALES', 'ACCOUNTS'),
  aiLimiter,
  validate({ body: assistantSchema }),
  assistant,
)

export default router
