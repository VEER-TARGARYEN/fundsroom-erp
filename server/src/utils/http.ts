import type { Request } from 'express'

/**
 * Read a route param as a guaranteed string. Express 5 types params as
 * `string | string[]` (wildcard support); our routes only use single-value
 * params (validated as UUIDs), so we narrow to the first string here.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : value
}
