import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { Role } from '@prisma/client'
import { env } from '../config/env'
import { AppError } from './AppError'

export interface AccessTokenClaims {
  sub: string // user id
  email: string
  role: Role
  type: 'access'
}

const ALGO: jwt.Algorithm = 'HS256'

/** Sign a short-lived access token (Bearer). */
export function signAccessToken(user: { id: string; email: string; role: Role }): string {
  return jwt.sign({ email: user.email, role: user.role, type: 'access' }, env.JWT_ACCESS_SECRET, {
    algorithm: ALGO,
    subject: user.id,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  })
}

/** Sign a long-lived refresh token (delivered as an HttpOnly cookie). */
export function signRefreshToken(user: { id: string }): string {
  return jwt.sign({ type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    algorithm: ALGO,
    subject: user.id,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    jwtid: randomUUID(),
    expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  })
}

function verify(token: string, secret: string): jwt.JwtPayload {
  try {
    // The algorithms allowlist is MANDATORY — it blocks the alg:"none" bypass
    // and RS256->HS256 key-confusion attacks.
    const decoded = jwt.verify(token, secret, {
      algorithms: [ALGO],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    })
    if (typeof decoded === 'string') throw new Error('unexpected string payload')
    return decoded
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Token expired', 'TOKEN_EXPIRED')
    }
    throw AppError.unauthorized('Invalid token', 'INVALID_TOKEN')
  }
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const p = verify(token, env.JWT_ACCESS_SECRET)
  if (p.type !== 'access' || !p.sub) throw AppError.unauthorized('Invalid token', 'INVALID_TOKEN')
  return { sub: p.sub, email: p.email as string, role: p.role as Role, type: 'access' }
}

export function verifyRefreshToken(token: string): { sub: string; jti?: string } {
  const p = verify(token, env.JWT_REFRESH_SECRET)
  if (p.type !== 'refresh' || !p.sub) throw AppError.unauthorized('Invalid token', 'INVALID_TOKEN')
  return { sub: p.sub, jti: p.jti }
}
