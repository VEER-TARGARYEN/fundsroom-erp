/**
 * Operational error with an HTTP status, a stable machine-readable `code`, and
 * an optional `details` payload (used e.g. to return the full list of
 * insufficient-stock items on a failed challan confirmation).
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown
  readonly isOperational = true

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
    Error.captureStackTrace?.(this, AppError)
  }

  static badRequest(message: string, code = 'BAD_REQUEST', details?: unknown) {
    return new AppError(400, code, message, details)
  }
  static unauthorized(message = 'Authentication required', code = 'UNAUTHENTICATED') {
    return new AppError(401, code, message)
  }
  static forbidden(message = 'You do not have access to this resource', code = 'FORBIDDEN') {
    return new AppError(403, code, message)
  }
  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(404, code, message)
  }
  static conflict(message: string, code = 'CONFLICT', details?: unknown) {
    return new AppError(409, code, message, details)
  }
}
