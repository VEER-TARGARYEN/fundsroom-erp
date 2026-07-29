import type { Request, Response, NextFunction, RequestHandler } from 'express'

/**
 * Wrap an async route handler so any rejected promise is forwarded to Express's
 * error middleware. (Express 5 forwards async rejections for you, but wrapping
 * keeps behaviour explicit and consistent across handlers.)
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
