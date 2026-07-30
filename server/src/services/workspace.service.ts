import { prisma } from '../config/prisma'
import { logger } from '../config/logger'
import { AppError } from '../utils/AppError'
import { getAccessTokenForUser } from './google.service'

/**
 * Google Workspace actions performed as the signed-in user.
 *
 * Every call goes through `getAccessTokenForUser`, which refreshes on demand,
 * so callers never deal with expiry. Called against the REST endpoints directly
 * — `googleapis` would add tens of megabytes for four requests.
 */

async function gapi<T>(
  userId: string,
  url: string,
  init: RequestInit & { body?: string } = {},
): Promise<T> {
  const token = await getAccessTokenForUser(userId)
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text()
    logger.warn({ status: res.status, url, body: text.slice(0, 400) }, 'google api call failed')
    // 403 here is almost always a missing scope from a partial consent, which
    // the user fixes by reconnecting — say so instead of a generic failure.
    if (res.status === 401 || res.status === 403) {
      throw AppError.badRequest(
        'Google rejected the request — reconnect your account and allow all requested permissions.',
        'GOOGLE_REAUTH_REQUIRED',
      )
    }
    throw AppError.badRequest('Google API request failed', 'GOOGLE_API_FAILED')
  }
  return (await res.json()) as T
}

// ── Sheets ──────────────────────────────────────────────────────────────────

interface SheetCreateResponse {
  spreadsheetId: string
  spreadsheetUrl: string
}

/**
 * Create a spreadsheet and fill it in one flow.
 *
 * Values are written with `USER_ENTERED` so numbers and dates land as native
 * types rather than text — otherwise the recipient can't sum a column, which
 * defeats the point of exporting to Sheets rather than CSV.
 */
export async function exportToSheet(params: {
  userId: string
  title: string
  sheets: { name: string; header: string[]; rows: (string | number)[][] }[]
}): Promise<{ spreadsheetId: string; url: string }> {
  const { userId, title, sheets } = params

  const created = await gapi<SheetCreateResponse>(userId, 'https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: sheets.map((s, i) => ({
        properties: { title: s.name.slice(0, 90), sheetId: i, index: i },
      })),
    }),
  })

  // One batch call for all tabs keeps this to a single round-trip.
  await gapi(
    userId,
    `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: sheets.map((s) => ({
          range: `${s.name.slice(0, 90)}!A1`,
          values: [s.header, ...s.rows],
        })),
      }),
    },
  )

  // Bold + freeze the header row so the sheet is usable on open.
  await gapi(
    userId,
    `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: sheets.flatMap((_s, i) => [
          {
            repeatCell: {
              range: { sheetId: i, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: 'userEnteredFormat.textFormat.bold',
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId: i, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          { autoResizeDimensions: { dimensions: { sheetId: i, dimension: 'COLUMNS' } } },
        ]),
      }),
    },
  )

  return { spreadsheetId: created.spreadsheetId, url: created.spreadsheetUrl }
}

/** Products + confirmed sales, as two tabs in one spreadsheet. */
export async function exportErpSnapshot(userId: string, opts: { products: boolean; sales: boolean }) {
  const sheets: { name: string; header: string[]; rows: (string | number)[][] }[] = []

  if (opts.products) {
    const products = await prisma.product.findMany({ orderBy: { sku: 'asc' } })
    sheets.push({
      name: 'Products',
      header: ['SKU', 'Name', 'Category', 'Unit Price', 'Stock', 'Min Stock', 'Stock Value', 'Warehouse'],
      rows: products.map((p) => [
        p.sku, p.name, p.category,
        Number(p.unitPrice), p.stockQuantity, p.minStock,
        Number(p.unitPrice) * p.stockQuantity,
        p.warehouseLocation,
      ]),
    })
  }

  if (opts.sales) {
    // Bounded: a spreadsheet is not an archive, and Sheets caps cells per file.
    const challans = await prisma.challan.findMany({
      where: { status: 'CONFIRMED' },
      orderBy: { confirmedAt: 'desc' },
      take: 5_000,
      include: { customer: { select: { businessName: true, gstin: true, city: true } } },
    })
    sheets.push({
      name: 'Sales',
      header: ['Challan No.', 'Customer', 'GSTIN', 'City', 'Subtotal', 'Tax', 'Total', 'Confirmed'],
      rows: challans.map((c) => [
        c.challanNumber, c.customer.businessName, c.customer.gstin ?? '', c.customer.city ?? '',
        Number(c.subtotal), Number(c.taxAmount), Number(c.totalAmount),
        c.confirmedAt ? c.confirmedAt.toISOString().slice(0, 10) : '',
      ]),
    })
  }

  if (sheets.length === 0) throw AppError.badRequest('Nothing selected to export', 'NOTHING_TO_EXPORT')

  const stamp = new Date().toISOString().slice(0, 10)
  return exportToSheet({ userId, title: `Fundsroom ERP export ${stamp}`, sheets })
}

// ── Calendar ────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string
  htmlLink: string
}

/**
 * Create all-day follow-up events for customers with a due date.
 *
 * Uses a deterministic `id` derived from the customer so re-running updates the
 * existing event instead of creating duplicates — the same idempotency concern
 * as the notification agent. Google requires ids to be base32hex (a-v, 0-9).
 */
export async function syncFollowUpsToCalendar(userId: string, opts: { days?: number } = {}) {
  const horizon = new Date()
  horizon.setDate(horizon.getDate() + (opts.days ?? 30))

  const customers = await prisma.customer.findMany({
    where: { followUpDate: { not: null, lte: horizon }, status: { in: ['LEAD', 'ACTIVE'] } },
    orderBy: { followUpDate: 'asc' },
    take: 100,
    select: {
      id: true, businessName: true, contactPerson: true, mobile: true,
      email: true, city: true, followUpDate: true, status: true,
    },
  })

  let created = 0
  let updated = 0
  const links: string[] = []

  for (const c of customers) {
    const date = c.followUpDate!.toISOString().slice(0, 10)
    const end = new Date(c.followUpDate!)
    end.setDate(end.getDate() + 1)

    // uuid hex -> base32hex alphabet, prefixed to stay within Google's rules.
    const eventId = 'fr' + c.id.replace(/-/g, '').replace(/[w-z]/g, 'v').slice(0, 30)

    const body = JSON.stringify({
      id: eventId,
      summary: `Follow up: ${c.businessName}`,
      description:
        `Contact: ${c.contactPerson}\nMobile: ${c.mobile}` +
        (c.email ? `\nEmail: ${c.email}` : '') +
        (c.city ? `\nCity: ${c.city}` : '') +
        `\nStatus: ${c.status}\n\nCreated by Fundsroom ERP.`,
      start: { date },
      end: { date: end.toISOString().slice(0, 10) },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 9 * 60 }] },
      source: { title: 'Fundsroom ERP', url: 'https://fundsroom-erp-nine.vercel.app/customers' },
    })

    try {
      const ev = await gapi<CalendarEvent>(
        userId,
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        { method: 'POST', body },
      )
      created++
      if (links.length < 5) links.push(ev.htmlLink)
    } catch (err) {
      // 409 means the deterministic id already exists — patch it instead, so a
      // moved follow-up date updates rather than silently diverging.
      try {
        const ev = await gapi<CalendarEvent>(
          userId,
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
          { method: 'PUT', body },
        )
        updated++
        if (links.length < 5) links.push(ev.htmlLink)
      } catch {
        logger.warn({ customer: c.businessName, err }, 'calendar: event sync failed')
      }
    }
  }

  return { considered: customers.length, created, updated, links }
}

// ── Gmail ───────────────────────────────────────────────────────────────────

/** RFC 2822 message, base64url encoded as Gmail's API requires. */
function buildRawMessage(p: { to: string; subject: string; html: string; from?: string }): string {
  const lines = [
    `To: ${p.to}`,
    p.from ? `From: ${p.from}` : null,
    `Subject: ${p.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    p.html,
  ].filter(Boolean)

  return Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Send mail as the signed-in user via their Gmail account. */
export async function sendViaGmail(params: {
  userId: string
  to: string
  subject: string
  html: string
}): Promise<{ id: string }> {
  return gapi<{ id: string }>(
    params.userId,
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      body: JSON.stringify({
        raw: buildRawMessage({ to: params.to, subject: params.subject, html: params.html }),
      }),
    },
  )
}
