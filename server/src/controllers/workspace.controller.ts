import type { Request, Response } from 'express'
import { prisma } from '../config/prisma'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import {
  exportErpSnapshot,
  syncFollowUpsToCalendar,
  sendViaGmail,
} from '../services/workspace.service'

const CRM_ROLES = ['ADMIN', 'SALES', 'ACCOUNTS']

/** POST /api/workspace/sheets/export */
export const sheetsExport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const body = (req.body ?? {}) as { products?: boolean; sales?: boolean }

  // Only export what this role can already read through the normal API.
  const canProducts = ['ADMIN', 'SALES', 'WAREHOUSE'].includes(req.user.role)
  const canSales = CRM_ROLES.includes(req.user.role)

  const result = await exportErpSnapshot(req.user.id, {
    products: (body.products ?? true) && canProducts,
    sales: (body.sales ?? true) && canSales,
  })
  res.json({ data: result })
})

/** POST /api/workspace/calendar/sync-followups */
export const calendarSync = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  if (!CRM_ROLES.includes(req.user.role)) {
    throw AppError.forbidden('Your role cannot access customer follow-ups')
  }
  const days = Number((req.body as { days?: number } | undefined)?.days ?? 30)
  const result = await syncFollowUpsToCalendar(req.user.id, {
    days: Number.isFinite(days) ? Math.min(365, Math.max(1, days)) : 30,
  })
  res.json({ data: result })
})

/**
 * POST /api/workspace/gmail/send-digest
 *
 * Sends the current open alerts to a recipient from the user's own Gmail.
 * Deliberately not free-form: the body cannot be supplied by the caller, so
 * this endpoint can't be turned into an open relay for arbitrary mail.
 */
export const gmailSendDigest = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const to = (req.body as { to?: string } | undefined)?.to?.trim() || req.user.email
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    throw AppError.badRequest('A valid recipient email is required', 'INVALID_RECIPIENT')
  }

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 25,
    }),
    prisma.notification.count(),
  ])
  if (total === 0) throw AppError.badRequest('There are no open alerts to send', 'NOTHING_TO_SEND')

  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

  const rows = notifications
    .map(
      (n) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap"><b>${esc(n.severity)}</b></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">
          <b>${esc(n.title)}</b><br><span style="color:#4b5563">${esc(n.body)}</span>
        </td></tr>`,
    )
    .join('')

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
      <h2 style="margin:0 0 4px">Fundsroom ERP — open alerts</h2>
      <p style="color:#6b7280;margin:0 0 12px">${total} open · showing ${notifications.length}</p>
      <table style="border-collapse:collapse;width:100%">${rows}</table>
    </div>`

  const sent = await sendViaGmail({
    userId: req.user.id,
    to,
    subject: `Fundsroom ERP — ${total} open alert${total === 1 ? '' : 's'}`,
    html,
  })
  res.json({ data: { messageId: sent.id, to, alerts: notifications.length } })
})
