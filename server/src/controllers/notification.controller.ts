import type { Request, Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { env } from '../config/env'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import { param } from '../utils/http'
import { runAgentScan } from '../services/agent.service'
import { mailEnabled } from '../services/mailer.service'
import { aiEnabled } from '../config/ai'
import { paginationMeta, toSkipTake } from '../schemas/common.schema'
import type { ListNotificationQuery } from '../schemas/notification.schema'

/** Constant-time compare so the secret can't be recovered by timing the endpoint. */
function secretMatches(provided: string | undefined): boolean {
  if (!env.AGENT_SECRET || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(env.AGENT_SECRET)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** GET /api/notifications — open alerts, newest first. */
export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const q = req.validatedQuery as ListNotificationQuery
  const where: Prisma.NotificationWhereInput = {}
  if (q.unread) where.readAt = null
  // An empty array is deliberate — "user disabled every stream" must match
  // nothing, not fall through to an unfiltered list.
  if (q.types) where.type = { in: q.types }

  const [data, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(q) }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { readAt: null } }),
  ])
  res.json({ data, unread, pagination: paginationMeta(q.page, q.limit, total) })
})

/** GET /api/notifications/unread-count — drives the header badge. */
export const unreadCount = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: { unread: await prisma.notification.count({ where: { readAt: null } }) } })
})

/** POST /api/notifications/:id/read */
export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const id = param(req, 'id')
  const existing = await prisma.notification.findUnique({ where: { id } })
  if (!existing) throw AppError.notFound('Notification not found')

  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: existing.readAt ? null : new Date() },
  })
  res.json({ data: updated })
})

/** POST /api/notifications/read-all */
export const markAllRead = asyncHandler(async (_req: Request, res: Response) => {
  const r = await prisma.notification.updateMany({
    where: { readAt: null },
    data: { readAt: new Date() },
  })
  res.json({ data: { updated: r.count } })
})

/**
 * POST /api/agent/scan — run the detection cycle.
 *
 * Two callers, two auth paths: an unattended scheduler presenting
 * `x-agent-secret`, or a signed-in ADMIN pressing the button in the UI. The
 * secret path is only available when AGENT_SECRET is configured, so a
 * misconfigured deploy fails closed rather than exposing an open endpoint.
 */
export const scan = asyncHandler(async (req: Request, res: Response) => {
  const viaSecret = secretMatches(req.header('x-agent-secret'))
  if (!viaSecret) {
    if (!req.user) throw AppError.unauthorized()
    if (req.user.role !== 'ADMIN') throw AppError.forbidden('Only an administrator can run the agent')
  }

  // A manual run from the UI shouldn't fire emails; scheduled runs should.
  const result = await runAgentScan({ notify: viaSecret })
  res.json({ data: result })
})

/** GET /api/agent/status — what the agent can currently do. */
export const agentStatus = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    data: {
      scheduleConfigured: Boolean(env.AGENT_SECRET),
      emailConfigured: mailEnabled,
      aiConfigured: aiEnabled,
    },
  })
})
