import type { Request, Response, NextFunction, RequestHandler } from 'express'
import type { Role } from '@prisma/client'
import { verifyAccessToken } from '../utils/jwt'
import { AppError } from '../utils/AppError'

/**
 * Authenticate the request from the `Authorization: Bearer <token>` header.
 * On success attaches `req.user`; otherwise responds 401 via the error handler.
 */
export const authenticate: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing or malformed Authorization header', 'NO_TOKEN')
  }
  const claims = verifyAccessToken(header.slice(7).trim())
  req.user = { id: claims.sub, email: claims.email, role: claims.role }
  next()
}

/**
 * Role-Based Access Control guard. Use AFTER `authenticate`.
 *
 *   router.post('/products/:id/adjust-stock',
 *     authenticate, checkRole('ADMIN', 'WAREHOUSE'), handler)
 *
 * 401 = not authenticated; 403 = authenticated but role not permitted.
 */
export const checkRole =
  (...allowed: Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw AppError.unauthorized()
    if (!allowed.includes(req.user.role)) {
      throw AppError.forbidden(
        `Role ${req.user.role} is not permitted to perform this action`,
        'ROLE_FORBIDDEN',
      )
    }
    next()
  }
