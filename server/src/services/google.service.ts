import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { GoogleAccount, Role } from '@prisma/client'
import { prisma } from '../config/prisma'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { AppError } from '../utils/AppError'
import { encryptToken, decryptToken, tokenEncryptionAvailable } from '../utils/crypto'

/**
 * Google OAuth 2.0 (authorization code) + Workspace token management.
 *
 * Implemented against the HTTP endpoints with global fetch rather than
 * googleapis, which is a very large dependency for the handful of calls we
 * make and would meaningfully slow installs on the free tier.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

/** Identity scopes — always requested. */
const IDENTITY_SCOPES = ['openid', 'email', 'profile']

/** Workspace scopes, requested only when connecting (not for plain sign-in). */
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.send',
]

export const googleConfigured = () =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI)

export type OAuthIntent = 'login' | 'connect'

interface StatePayload {
  nonce: string
  intent: OAuthIntent
  /** Present for `connect`, so the callback knows whose account to link. */
  userId?: string
  redirect?: string
}

/**
 * The `state` parameter is a short-lived signed JWT rather than an opaque
 * random value in a session store. It is the CSRF defence for the callback:
 * an attacker cannot forge one without the signing secret, and the 10-minute
 * expiry bounds replay. It also carries the intent, avoiding server-side state
 * that a free instance would lose on spin-down.
 */
function signState(payload: Omit<StatePayload, 'nonce'>): string {
  return jwt.sign({ ...payload, nonce: randomBytes(16).toString('hex') }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: '10m',
    issuer: env.JWT_ISSUER,
    audience: 'google-oauth',
  })
}

export function verifyState(state: string): StatePayload {
  try {
    const p = jwt.verify(state, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: 'google-oauth',
    })
    if (typeof p === 'string') throw new Error('bad state')
    return p as unknown as StatePayload
  } catch {
    throw AppError.unauthorized('Invalid or expired OAuth state', 'INVALID_OAUTH_STATE')
  }
}

export function buildAuthUrl(opts: { intent: OAuthIntent; userId?: string; redirect?: string }): string {
  if (!googleConfigured()) {
    throw AppError.badRequest('Google sign-in is not configured', 'GOOGLE_NOT_CONFIGURED')
  }
  const scopes =
    opts.intent === 'connect' ? [...IDENTITY_SCOPES, ...WORKSPACE_SCOPES] : IDENTITY_SCOPES

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: scopes.join(' '),
    state: signState({ intent: opts.intent, userId: opts.userId, redirect: opts.redirect }),
    // offline + consent so we actually receive a refresh token. Google omits it
    // on repeat authorisations unless consent is re-prompted.
    access_type: 'offline',
    prompt: opts.intent === 'connect' ? 'consent' : 'select_account',
    include_granted_scopes: 'true',
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  id_token?: string
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string }
  if (!res.ok) {
    logger.warn({ status: res.status, error: json.error, desc: json.error_description }, 'google: token exchange failed')
    throw AppError.unauthorized(json.error_description ?? 'Google token exchange failed', 'GOOGLE_TOKEN_FAILED')
  }
  return json
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  return postToken({
    code,
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: env.GOOGLE_REDIRECT_URI!,
    grant_type: 'authorization_code',
  })
}

export interface GoogleProfile {
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  picture?: string
}

export async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw AppError.unauthorized('Could not read Google profile', 'GOOGLE_PROFILE_FAILED')
  return (await res.json()) as GoogleProfile
}

/**
 * Whether an unknown Google email may create an account.
 *
 * Fails closed. Without GOOGLE_ALLOWED_EMAILS, sign-in is limited to emails
 * that already exist as users — otherwise anyone with a Google account could
 * provision themselves into the ERP.
 */
export function isAllowedToProvision(email: string): boolean {
  const raw = env.GOOGLE_ALLOWED_EMAILS?.trim()
  if (!raw) return false
  const needle = email.toLowerCase()
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => (rule.startsWith('@') ? needle.endsWith(rule) : rule === needle))
}

/** Find the user this Google identity maps to, provisioning only if permitted. */
export async function resolveUser(profile: GoogleProfile) {
  if (!profile.email) {
    throw AppError.unauthorized('Google account has no email', 'GOOGLE_NO_EMAIL')
  }
  // An unverified address must not be trusted to match an existing account —
  // that would be an account-takeover path.
  if (profile.email_verified === false) {
    throw AppError.unauthorized('Google email is not verified', 'GOOGLE_EMAIL_UNVERIFIED')
  }

  const byGoogle = await prisma.googleAccount.findUnique({
    where: { googleSub: profile.sub },
    include: { user: true },
  })
  if (byGoogle) {
    if (!byGoogle.user.isActive) throw AppError.unauthorized('Account disabled', 'ACCOUNT_DISABLED')
    return byGoogle.user
  }

  const email = profile.email.toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (!existing.isActive) throw AppError.unauthorized('Account disabled', 'ACCOUNT_DISABLED')
    return existing
  }

  if (!isAllowedToProvision(email)) {
    throw AppError.forbidden(
      'This Google account is not permitted to sign in. Ask an administrator to create your user first.',
      'GOOGLE_NOT_PERMITTED',
    )
  }

  // Provisioned users have no password; the column is NOT NULL, so store an
  // unusable placeholder. It can never match a bcrypt/argon2 verification.
  return prisma.user.create({
    data: {
      email,
      name: profile.name ?? email.split('@')[0]!,
      role: env.GOOGLE_DEFAULT_ROLE as Role,
      passwordHash: 'google-oauth-no-password',
    },
  })
}

/** Store or update the link, encrypting tokens and preserving an existing refresh token. */
export async function upsertGoogleAccount(params: {
  userId: string
  profile: GoogleProfile
  tokens: TokenResponse
}): Promise<void> {
  const { userId, profile, tokens } = params
  const storeTokens = tokenEncryptionAvailable()

  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null
  const access = storeTokens ? encryptToken(tokens.access_token) : null
  // Google returns refresh_token only on first consent — never clobber a stored
  // one with null, or the Workspace connection silently dies on next expiry.
  const refresh = storeTokens && tokens.refresh_token ? encryptToken(tokens.refresh_token) : undefined

  await prisma.googleAccount.upsert({
    where: { userId },
    create: {
      userId,
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name ?? null,
      picture: profile.picture ?? null,
      accessToken: access,
      refreshToken: refresh ?? null,
      expiresAt,
      scope: tokens.scope ?? null,
    },
    update: {
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name ?? null,
      picture: profile.picture ?? null,
      accessToken: access,
      ...(refresh !== undefined ? { refreshToken: refresh } : {}),
      expiresAt,
      ...(tokens.scope ? { scope: tokens.scope } : {}),
    },
  })
}

/**
 * A usable access token for this user, refreshing if it's expired or about to be.
 * Throws a typed error the callers turn into "reconnect Google" in the UI.
 */
export async function getAccessTokenForUser(userId: string): Promise<string> {
  const acct = await prisma.googleAccount.findUnique({ where: { userId } })
  if (!acct) throw AppError.badRequest('Google account not connected', 'GOOGLE_NOT_CONNECTED')

  const stillValid = acct.accessToken && acct.expiresAt && acct.expiresAt.getTime() - 60_000 > Date.now()
  if (stillValid) return decryptToken(acct.accessToken!)

  if (!acct.refreshToken) {
    throw AppError.badRequest(
      'Google authorisation expired — reconnect your account',
      'GOOGLE_REAUTH_REQUIRED',
    )
  }

  const tokens = await postToken({
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    refresh_token: decryptToken(acct.refreshToken),
    grant_type: 'refresh_token',
  })

  await prisma.googleAccount.update({
    where: { userId },
    data: {
      accessToken: encryptToken(tokens.access_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      ...(tokens.scope ? { scope: tokens.scope } : {}),
    },
  })
  return tokens.access_token
}

/** True when the stored grant covers every scope a feature needs. */
export function hasScopes(acct: Pick<GoogleAccount, 'scope'>, needed: string[]): boolean {
  const granted = new Set((acct.scope ?? '').split(/\s+/).filter(Boolean))
  return needed.every((s) => granted.has(s))
}

/** Revoke at Google, then drop the local link. Best-effort on the remote call. */
export async function disconnect(userId: string): Promise<void> {
  const acct = await prisma.googleAccount.findUnique({ where: { userId } })
  if (!acct) return

  const token = acct.refreshToken ?? acct.accessToken
  if (token) {
    try {
      await fetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: decryptToken(token) }).toString(),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (err) {
      // Revocation failing shouldn't block the user from unlinking locally.
      logger.warn({ err }, 'google: revoke failed')
    }
  }
  await prisma.googleAccount.delete({ where: { userId } })
}
