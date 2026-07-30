import type { Request, Response } from 'express'
import { prisma } from '../config/prisma'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import { signRefreshToken } from '../utils/jwt'
import { tokenEncryptionAvailable } from '../utils/crypto'
import { setRefreshCookie } from './auth.controller'
import {
  buildAuthUrl,
  verifyState,
  exchangeCode,
  fetchProfile,
  resolveUser,
  upsertGoogleAccount,
  disconnect,
  googleConfigured,
  hasScopes,
  WORKSPACE_SCOPES,
} from '../services/google.service'

/** Where to bounce the browser back to after the callback. */
function frontend(path: string): string {
  const base = env.APP_URL?.replace(/\/+$/, '') ?? ''
  return `${base}${path}`
}

/**
 * GET /api/auth/google?intent=login|connect
 *
 * Deliberately unauthenticated. This is a top-level browser navigation, so it
 * cannot carry a bearer token, and putting one in the query string would leak it
 * into history and logs. Both intents therefore identify the user the same way —
 * via the verified Google email in the callback — and differ only in which
 * scopes are requested: `connect` additionally asks for Sheets, Calendar and
 * Gmail. CSRF is covered by the signed `state`.
 */
export const googleStart = asyncHandler(async (req: Request, res: Response) => {
  const redirect = typeof req.query.redirect === 'string' ? req.query.redirect : undefined
  const intent = req.query.intent === 'connect' ? 'connect' : 'login'

  if (intent === 'connect' && !tokenEncryptionAvailable()) {
    throw AppError.badRequest(
      'Workspace connection is disabled because TOKEN_ENC_KEY is not set',
      'TOKEN_ENCRYPTION_UNAVAILABLE',
    )
  }
  res.redirect(buildAuthUrl({ intent, redirect }))
})

/**
 * GET /api/auth/google/callback
 *
 * Google sends the browser here. Because this is a top-level navigation and not
 * an XHR, failures have to be communicated by redirecting back to the frontend
 * with an error code rather than by returning JSON.
 */
export const googleCallback = asyncHandler(async (req: Request, res: Response) => {
  const fail = (code: string) => res.redirect(frontend(`/login?error=${encodeURIComponent(code)}`))

  const { code, state, error } = req.query as Record<string, string | undefined>
  if (error) return fail(error)
  if (!code || !state) return fail('missing_code')

  let parsed: ReturnType<typeof verifyState>
  try {
    parsed = verifyState(state)
  } catch {
    return fail('invalid_state')
  }

  try {
    const tokens = await exchangeCode(code)
    const profile = await fetchProfile(tokens.access_token)

    // Identity always comes from the verified Google profile, for both intents.
    // resolveUser matches on googleSub first, then verified email, and refuses
    // to provision an unknown address unless it's explicitly allowlisted.
    const user = await resolveUser(profile)
    if (!user.isActive) return fail('account_unavailable')

    await upsertGoogleAccount({ userId: user.id, profile, tokens })

    // Same session mechanism as password login — one auth model, not two.
    setRefreshCookie(res, signRefreshToken(user))

    const dest = parsed.redirect && parsed.redirect.startsWith('/') ? parsed.redirect : '/'
    return res.redirect(frontend(`${dest}${dest.includes('?') ? '&' : '?'}google=connected`))
  } catch (err) {
    const code = err instanceof AppError ? err.code : 'google_failed'
    logger.warn({ err }, 'google: callback failed')
    return fail(code)
  }
})

/** GET /api/auth/google/status — what the UI should offer. */
export const googleStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const acct = await prisma.googleAccount.findUnique({ where: { userId: req.user.id } })
  res.json({
    data: {
      available: googleConfigured(),
      encryptionReady: tokenEncryptionAvailable(),
      connected: Boolean(acct),
      email: acct?.email ?? null,
      picture: acct?.picture ?? null,
      /** False after a partial consent — the UI prompts to reconnect. */
      workspaceReady: acct ? hasScopes(acct, WORKSPACE_SCOPES) : false,
      scopes: acct?.scope?.split(/\s+/).filter(Boolean) ?? [],
    },
  })
})

/** POST /api/auth/google/disconnect — revoke at Google and unlink. */
export const googleDisconnect = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  await disconnect(req.user.id)
  res.json({ data: { disconnected: true } })
})
