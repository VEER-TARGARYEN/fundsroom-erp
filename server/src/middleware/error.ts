import type { Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { AppError } from '../utils/AppError'
import { logger } from '../config/logger'
import { env } from '../config/env'

/** 404 handler for unmatched routes (mounted after all routers). */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'))
}

interface ErrorBody {
  error: { code: string; message: string; details?: unknown }
}

/** Central error handler — the single place that shapes error responses. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500
  let body: ErrorBody = { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }

  if (err instanceof AppError) {
    status = err.statusCode
    body = { error: { code: err.code, message: err.message, details: err.details } }
  } else if (err instanceof ZodError) {
    status = 400
    body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
      },
    }
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // unique constraint
        status = 409
        body = {
          error: {
            code: 'DUPLICATE',
            message: `A record with this ${(err.meta?.target as string[])?.join(', ') ?? 'value'} already exists`,
          },
        }
        break
      case 'P2025': // record not found
        status = 404
        body = { error: { code: 'NOT_FOUND', message: 'Record not found' } }
        break
      case 'P2003': // FK violation
        status = 400
        body = { error: { code: 'FK_VIOLATION', message: 'Related record does not exist' } }
        break
      default:
        status = 400
        body = { error: { code: `PRISMA_${err.code}`, message: 'Database request error' } }
    }
  }

  // Log 5xx as errors (with stack); 4xx as warnings (expected/operational).
  const logPayload = { err, method: req.method, url: req.originalUrl, status }
  if (status >= 500) logger.error(logPayload, 'Unhandled error')
  else logger.warn({ code: body.error.code, method: req.method, url: req.originalUrl }, body.error.message)

  // Never leak internals in production.
  if (status >= 500 && env.isProd) {
    body = { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }
  }

  res.status(status).json(body)
}
