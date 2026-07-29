import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { ZodError, type ZodType } from 'zod'
import { AppError } from '../utils/AppError'

export interface ValidationSchemas {
  body?: ZodType
  query?: ZodType
  params?: ZodType
}

/**
 * Zod request-validation middleware. Validates any of body / query / params
 * against the supplied schemas and, on success, replaces the request data with
 * the parsed (coerced, stripped) values.
 *
 * NOTE: Express 5 exposes `req.query` via a read-only getter, so validated query
 * is stored on `req.validatedQuery` (typed in src/types/express.d.ts) rather than
 * reassigned. Controllers read pagination/filters from there.
 *
 * On failure it throws a 400 AppError whose `details` list every offending field.
 */
export const validate =
  (schemas: ValidationSchemas): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body)
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params
      if (schemas.query) req.validatedQuery = schemas.query.parse(req.query)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((i) => ({
          field: i.path.join('.') || '(root)',
          message: i.message,
        }))
        throw AppError.badRequest('Request validation failed', 'VALIDATION_ERROR', details)
      }
      throw err
    }
  }
