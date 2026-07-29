import { Router } from 'express'
import { login, refresh, logout, me } from '../controllers/auth.controller'
import { authenticate } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { authLimiter } from '../middleware/rateLimit'
import { loginSchema } from '../schemas/auth.schema'

const router = Router()

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and receive an access token (+ refresh cookie)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginInput' }
 *     responses:
 *       200: { description: Authenticated, content: { application/json: { schema: { $ref: '#/components/schemas/LoginResponse' } } } }
 *       401: { description: Invalid credentials, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
router.post('/login', authLimiter, validate({ body: loginSchema }), login)

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange the refresh cookie for a new access token
 *     security: []
 *     responses:
 *       200: { description: New access token }
 *       401: { description: Missing/invalid refresh token }
 */
router.post('/refresh', authLimiter, refresh)

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Clear the refresh cookie
 *     security: []
 *     responses:
 *       200: { description: Logged out }
 */
router.post('/logout', logout)

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current authenticated user
 *     responses:
 *       200: { description: Current user }
 *       401: { description: Unauthenticated }
 */
router.get('/me', authenticate, me)

export default router
