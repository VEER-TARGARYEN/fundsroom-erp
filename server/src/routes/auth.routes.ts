import { Router } from 'express'
import { login, refresh, logout, me } from '../controllers/auth.controller'
import {
  googleStart,
  googleCallback,
  googleStatus,
  googleDisconnect,
} from '../controllers/google.controller'
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

// ── Google OAuth ────────────────────────────────────────────────────────────
// The start/callback pair are top-level browser navigations, so they are GETs
// without bearer auth; CSRF is handled by the signed `state` parameter.

/**
 * @openapi
 * /auth/google:
 *   get:
 *     tags: [Auth]
 *     summary: Redirect to Google for sign-in
 *     security: []
 *     responses:
 *       302: { description: Redirect to Google consent }
 */
router.get('/google', authLimiter, googleStart)


/**
 * @openapi
 * /auth/google/callback:
 *   get:
 *     tags: [Auth]
 *     summary: OAuth callback — sets the refresh cookie and redirects to the app
 *     security: []
 *     responses:
 *       302: { description: Redirect back to the frontend }
 */
router.get('/google/callback', authLimiter, googleCallback)

/**
 * @openapi
 * /auth/google/status:
 *   get:
 *     tags: [Auth]
 *     summary: Whether Google sign-in is available and currently linked
 *     responses:
 *       200: { description: Link status and granted scopes }
 */
router.get('/google/status', authenticate, googleStatus)

/**
 * @openapi
 * /auth/google/disconnect:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke the Google grant and unlink
 *     responses:
 *       200: { description: Disconnected }
 */
router.post('/google/disconnect', authenticate, googleDisconnect)

export default router
