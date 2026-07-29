import { Prisma, type NotificationSeverity, type NotificationType } from '@prisma/client'
import { prisma } from '../config/prisma'
import { logger } from '../config/logger'
import { getAiClient, aiEnabled } from '../config/ai'
import { env } from '../config/env'
import { sendAlertEmail } from './mailer.service'

/** A challan sitting in DRAFT longer than this is chased. */
const DRAFT_STALE_DAYS = 3

export interface DetectedAlert {
  type: NotificationType
  severity: NotificationSeverity
  title: string
  body: string
  entityId: string
  entityRef: string
  href: string
}

export interface ScanResult {
  detected: number
  created: number
  resolved: number
  open: number
  byType: Record<string, number>
  digest: string | null
  emailed: boolean
  durationMs: number
}

/**
 * Evaluate every rule against current data.
 *
 * Each rule returns at most one alert per entity, and `entityId` is what makes
 * the write idempotent later — see reconcile().
 */
async function detect(): Promise<DetectedAlert[]> {
  const staleBefore = new Date(Date.now() - DRAFT_STALE_DAYS * 86_400_000)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const [lowStock, staleDrafts, followUps] = await Promise.all([
    // Column-to-column comparison, so this can't use an index — kept bounded.
    prisma.product.findMany({
      where: { stockQuantity: { lte: prisma.product.fields.minStock } },
      select: { id: true, sku: true, name: true, stockQuantity: true, minStock: true },
      orderBy: { stockQuantity: 'asc' },
      take: 200,
    }),
    prisma.challan.findMany({
      where: { status: 'DRAFT', createdAt: { lt: staleBefore } },
      select: {
        id: true,
        challanNumber: true,
        totalAmount: true,
        createdAt: true,
        customer: { select: { businessName: true } },
      },
      orderBy: { totalAmount: 'desc' },
      take: 200,
    }),
    prisma.customer.findMany({
      where: { followUpDate: { lte: todayEnd }, status: { in: ['LEAD', 'ACTIVE'] } },
      select: { id: true, businessName: true, contactPerson: true, mobile: true, followUpDate: true },
      orderBy: { followUpDate: 'asc' },
      take: 200,
    }),
  ])

  const alerts: DetectedAlert[] = []

  for (const p of lowStock) {
    const out = p.stockQuantity <= 0
    alerts.push({
      type: out ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      severity: out ? 'CRITICAL' : 'WARNING',
      title: out ? 'Out of stock' : 'Low stock',
      body: `${p.name} (${p.sku}) — ${p.stockQuantity} on hand, minimum ${p.minStock}.`,
      entityId: p.id,
      entityRef: p.sku,
      href: '/products',
    })
  }

  for (const c of staleDrafts) {
    const days = Math.floor((Date.now() - c.createdAt.getTime()) / 86_400_000)
    alerts.push({
      type: 'DRAFT_STALE',
      severity: 'WARNING',
      title: 'Challan awaiting confirmation',
      body: `${c.challanNumber} for ${c.customer.businessName} — ₹${c.totalAmount.toFixed(2)} unconfirmed for ${days} days.`,
      entityId: c.id,
      entityRef: c.challanNumber,
      href: '/challans',
    })
  }

  for (const cu of followUps) {
    const due = cu.followUpDate!
    const overdueDays = Math.floor((Date.now() - due.getTime()) / 86_400_000)
    alerts.push({
      type: 'FOLLOW_UP_DUE',
      severity: overdueDays > 7 ? 'WARNING' : 'INFO',
      title: overdueDays > 0 ? 'Follow-up overdue' : 'Follow-up due today',
      body: `${cu.businessName} — ${cu.contactPerson}, ${cu.mobile}${overdueDays > 0 ? ` (${overdueDays}d overdue)` : ''}.`,
      entityId: cu.id,
      entityRef: cu.businessName,
      href: '/customers',
    })
  }

  return alerts
}

/**
 * Make the notifications table match reality.
 *
 * Inserts conditions that are newly true and deletes rows whose condition no
 * longer holds, so the table stays a view of *open* issues. Alerts that persist
 * across scans are left untouched — including their read state — because the
 * unique (type, entity_id) index turns the insert into a no-op for them.
 */
async function reconcile(alerts: DetectedAlert[]) {
  const keys = alerts.map((a) => ({ type: a.type, entityId: a.entityId }))

  const resolved = await prisma.notification.deleteMany({
    where: {
      type: { in: ['OUT_OF_STOCK', 'LOW_STOCK', 'DRAFT_STALE', 'FOLLOW_UP_DUE'] },
      NOT: keys.length > 0 ? { OR: keys } : undefined,
    },
  })

  const created = alerts.length
    ? await prisma.notification.createMany({ data: alerts, skipDuplicates: true })
    : { count: 0 }

  return { created: created.count, resolved: resolved.count }
}

/** Ask the LLM to turn raw alerts into a short prioritised briefing. */
async function buildDigest(alerts: DetectedAlert[]): Promise<string | null> {
  if (!aiEnabled || alerts.length === 0) return null
  const client = getAiClient()
  if (!client) return null

  const counts = alerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1
    return acc
  }, {})
  // Only the most severe handful go in the prompt — the counts carry the rest,
  // and this keeps the request small enough for the free tier.
  const sample = alerts
    .filter((a) => a.severity !== 'INFO')
    .slice(0, 25)
    .map((a) => `- [${a.severity}] ${a.title}: ${a.body}`)
    .join('\n')

  try {
    const res = await client.chat.completions.create({
      model: env.AI_MODEL,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content:
            'You are an operations analyst for an Indian B2B wholesale distributor. ' +
            'Given today\'s alerts, write a briefing of at most 4 short bullet points for the owner. ' +
            'Lead with money and risk, name specific SKUs or challan numbers, and state the action to take. ' +
            'Plain text only, no markdown headers, no preamble.',
        },
        {
          role: 'user',
          content: `Alert counts: ${JSON.stringify(counts)}\n\nMost severe:\n${sample || '(none)'}`,
        },
      ],
    })
    return res.choices[0]?.message?.content?.trim() ?? null
  } catch (err) {
    // A digest is a nice-to-have; never fail the scan because the LLM is down.
    logger.warn({ err }, 'agent: digest generation failed')
    return null
  }
}

/**
 * Run the full agent cycle: detect → reconcile → summarise → notify.
 *
 * Safe to run repeatedly; only genuinely new alerts are inserted and email is
 * only sent when something new appeared.
 */
export async function runAgentScan(options: { notify?: boolean } = {}): Promise<ScanResult> {
  const t0 = Date.now()
  const alerts = await detect()
  const { created, resolved } = await reconcile(alerts)

  const byType = alerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1
    return acc
  }, {})

  const digest = await buildDigest(alerts)

  let emailed = false
  // Silence is the point: no email unless the situation actually changed.
  if (options.notify !== false && created > 0) {
    emailed = await sendAlertEmail({ alerts, digest, created, resolved, byType })
  }

  const open = await prisma.notification.count()
  const result: ScanResult = {
    detected: alerts.length,
    created,
    resolved,
    open,
    byType,
    digest,
    emailed,
    durationMs: Date.now() - t0,
  }
  logger.info(result, 'agent: scan complete')
  return result
}

export { Prisma }
