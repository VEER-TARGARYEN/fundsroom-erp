import { Router } from 'express'
import {
  sheetsExport,
  calendarSync,
  gmailSendDigest,
} from '../controllers/workspace.controller'
import { authenticate } from '../middleware/auth'
import { aiLimiter } from '../middleware/rateLimit'

const router = Router()

// Reuses the AI limiter's shape (15/min): these are slow third-party calls and
// worth capping per user so one impatient click can't fan out to Google.
router.use(authenticate, aiLimiter)

/**
 * @openapi
 * /workspace/sheets/export:
 *   post:
 *     tags: [Workspace]
 *     summary: Export products and confirmed sales to a new Google Sheet
 *     responses:
 *       200: { description: Spreadsheet id and URL }
 *       400: { description: Google not connected or re-auth required }
 */
router.post('/sheets/export', sheetsExport)

/**
 * @openapi
 * /workspace/calendar/sync-followups:
 *   post:
 *     tags: [Workspace]
 *     summary: Create or update Google Calendar events for due follow-ups
 *     responses:
 *       200: { description: Counts of created/updated events }
 *       403: { description: Role cannot access follow-ups }
 */
router.post('/calendar/sync-followups', calendarSync)

/**
 * @openapi
 * /workspace/gmail/send-digest:
 *   post:
 *     tags: [Workspace]
 *     summary: Email the current open alerts from the user's own Gmail
 *     responses:
 *       200: { description: Gmail message id }
 *       400: { description: Nothing to send, or re-auth required }
 */
router.post('/gmail/send-digest', gmailSendDigest)

export default router
