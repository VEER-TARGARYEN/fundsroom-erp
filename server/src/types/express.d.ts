import type { Role } from '@prisma/client'

/**
 * Augment Express's Request with the authenticated user set by the `authenticate`
 * middleware. This file must be inside tsconfig's `include` for the type to apply.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string
        email: string
        role: Role
      }
      /** Parsed & coerced query params set by the `validate` middleware. */
      validatedQuery?: unknown
    }
  }
}

export {}
