import { Router } from 'express'
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} from '../controllers/notification.controller'
import { authenticate } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { idParamSchema } from '../schemas/common.schema'
import { listNotificationQuerySchema } from '../schemas/notification.schema'

const router = Router()

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List open alerts raised by the agent
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *       - { in: query, name: unread, schema: { type: string, enum: ['true','false'] } }
 *     responses:
 *       200: { description: A page of notifications plus the unread count }
 */
router.get('/', authenticate, validate({ query: listNotificationQuerySchema }), listNotifications)

/**
 * @openapi
 * /notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Unread count for the header badge
 *     responses:
 *       200: { description: Unread count }
 */
router.get('/unread-count', authenticate, unreadCount)

/**
 * @openapi
 * /notifications/read-all:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark every unread alert as read
 *     responses:
 *       200: { description: Number updated }
 */
router.post('/read-all', authenticate, markAllRead)

/**
 * @openapi
 * /notifications/{id}/read:
 *   post:
 *     tags: [Notifications]
 *     summary: Toggle read state on one alert
 *     responses:
 *       200: { description: The updated notification }
 *       404: { description: Not found }
 */
router.post('/:id/read', authenticate, validate({ params: idParamSchema }), markRead)

export default router
