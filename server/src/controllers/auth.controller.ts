import type { Request, Response } from 'express'
import { prisma } from '../config/prisma'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import { verifyPassword } from '../utils/password'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt'
import { env } from '../config/env'
import type { LoginInput } from '../schemas/auth.schema'

const REFRESH_COOKIE = 'fundsroom_rt'

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd, // requires HTTPS in production
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

function publicUser(u: { id: string; email: string; name: string; role: string }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role }
}

/** POST /api/auth/login — verify credentials, issue access + refresh tokens. */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginInput
  const user = await prisma.user.findUnique({ where: { email } })

  // Constant-ish response: verify against the hash (or a dummy) then check active.
  const ok = user ? await verifyPassword(user.passwordHash, password) : false
  if (!user || !ok || !user.isActive) {
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS')
  }

  const accessToken = signAccessToken(user)
  setRefreshCookie(res, signRefreshToken(user))
  res.json({ accessToken, tokenType: 'Bearer', user: publicUser(user) })
})

/** POST /api/auth/refresh — exchange the refresh cookie for a new access token. */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE]
  if (!token) throw AppError.unauthorized('No refresh token', 'NO_REFRESH_TOKEN')

  const { sub } = verifyRefreshToken(token)
  const user = await prisma.user.findUnique({ where: { id: sub } })
  if (!user || !user.isActive) throw AppError.unauthorized('Invalid session', 'INVALID_SESSION')

  const accessToken = signAccessToken(user)
  setRefreshCookie(res, signRefreshToken(user)) // sliding refresh
  res.json({ accessToken, tokenType: 'Bearer' })
})

/** POST /api/auth/logout — clear the refresh cookie. */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
  res.json({ success: true })
})

/** GET /api/auth/me — the current authenticated user. */
export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
  if (!user) throw AppError.notFound('User not found', 'USER_NOT_FOUND')
  res.json({ user: publicUser(user) })
})
