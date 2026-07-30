import { Prisma, type PaymentMethod } from '@prisma/client'
import { prisma } from '../config/prisma'
import { AppError } from '../utils/AppError'

/** Aging buckets, in days since the invoice (confirmation) date. */
export const AGING_BUCKETS = [
  { key: 'current', label: '0–30 days', from: 0, to: 30 },
  { key: 'b31_60', label: '31–60 days', from: 31, to: 60 },
  { key: 'b61_90', label: '61–90 days', from: 61, to: 90 },
  { key: 'b90plus', label: '90+ days', from: 91, to: null },
] as const

export interface RecordPaymentInput {
  challanId: string
  amount: number
  method: PaymentMethod
  reference?: string
  note?: string
  paidAt?: string
}

/**
 * Record a receipt against a confirmed challan.
 *
 * The invariant — total receipts may never exceed the challan total — spans rows,
 * so it can't be a CHECK constraint. Two clerks recording the closing payment at
 * the same moment would both read the same balance and both pass a naive check,
 * overpaying the invoice. So the challan row is locked FOR UPDATE first, which
 * serialises concurrent recordings against the same challan; the second waits,
 * then re-reads a sum that already includes the first.
 *
 * Only CONFIRMED challans are payable: a DRAFT isn't a receivable yet, and a
 * CANCELLED one never will be.
 */
export async function recordPayment(input: RecordPaymentInput, userId: string) {
  const amount = new Prisma.Decimal(input.amount.toFixed(2))
  if (amount.lte(0)) {
    throw AppError.badRequest('Payment amount must be greater than zero', 'INVALID_AMOUNT')
  }

  return prisma.$transaction(
    async (tx) => {
      // Lock the challan so a concurrent payment on the same invoice queues
      // behind this one rather than racing it.
      const rows = await tx.$queryRaw<
        { id: string; customer_id: string; total_amount: string; status: string }[]
      >`SELECT id, customer_id, total_amount::text, status::text
          FROM challans WHERE id = ${input.challanId}::uuid FOR UPDATE`

      const challan = rows[0]
      if (!challan) throw AppError.notFound('Challan not found', 'CHALLAN_NOT_FOUND')
      if (challan.status !== 'CONFIRMED') {
        throw AppError.badRequest(
          `Only confirmed challans can receive payments (this one is ${challan.status.toLowerCase()})`,
          'CHALLAN_NOT_PAYABLE',
        )
      }

      const agg = await tx.payment.aggregate({
        where: { challanId: input.challanId },
        _sum: { amount: true },
      })
      const paid = agg._sum.amount ?? new Prisma.Decimal(0)
      const total = new Prisma.Decimal(challan.total_amount)
      const outstanding = total.minus(paid)

      if (outstanding.lte(0)) {
        throw AppError.badRequest('This challan is already fully paid', 'ALREADY_SETTLED')
      }
      if (amount.gt(outstanding)) {
        throw AppError.badRequest(
          `Payment exceeds the outstanding balance of ₹${outstanding.toFixed(2)}`,
          'OVERPAYMENT',
          { outstanding: outstanding.toFixed(2), attempted: amount.toFixed(2) },
        )
      }

      const payment = await tx.payment.create({
        data: {
          challanId: input.challanId,
          customerId: challan.customer_id,
          amount,
          method: input.method,
          reference: input.reference?.trim() || null,
          note: input.note?.trim() || null,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          createdById: userId,
        },
        include: { challan: { select: { challanNumber: true } } },
      })

      const nowPaid = paid.plus(amount)
      return {
        payment,
        challanTotal: total.toFixed(2),
        paid: nowPaid.toFixed(2),
        outstanding: total.minus(nowPaid).toFixed(2),
        settled: total.minus(nowPaid).lte(0),
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  )
}

/** Remove a receipt (correcting a mistake). Restores the outstanding balance. */
export async function deletePayment(id: string) {
  const existing = await prisma.payment.findUnique({ where: { id } })
  if (!existing) throw AppError.notFound('Payment not found', 'PAYMENT_NOT_FOUND')
  await prisma.payment.delete({ where: { id } })
  return { deleted: true, challanId: existing.challanId }
}

interface AgingRow {
  bucket: string
  invoices: bigint
  outstanding: string
}

/**
 * Receivables aged by invoice date.
 *
 * Computed in one query over `challans LEFT JOIN payments`: outstanding is
 * always derived, never stored, so it cannot drift from the receipt rows.
 * Challans settled to zero (or below, which shouldn't happen) drop out via
 * HAVING rather than being filtered in JS.
 */
export async function agingSummary() {
  const rows = await prisma.$queryRaw<AgingRow[]>`
    WITH outstanding AS (
      SELECT c.id,
             c.confirmed_at,
             c.total_amount - COALESCE(SUM(p.amount), 0) AS due
        FROM challans c
        LEFT JOIN payments p ON p.challan_id = c.id
       WHERE c.status = 'CONFIRMED'
       GROUP BY c.id, c.confirmed_at, c.total_amount
      HAVING c.total_amount - COALESCE(SUM(p.amount), 0) > 0
    )
    SELECT bucket, COUNT(*)::bigint AS invoices, SUM(due)::text AS outstanding
      FROM (
        SELECT due,
               CASE
                 WHEN confirmed_at IS NULL THEN 'current'
                 WHEN (CURRENT_DATE - confirmed_at::date) <= 30 THEN 'current'
                 WHEN (CURRENT_DATE - confirmed_at::date) <= 60 THEN 'b31_60'
                 WHEN (CURRENT_DATE - confirmed_at::date) <= 90 THEN 'b61_90'
                 ELSE 'b90plus'
               END AS bucket
          FROM outstanding
      ) t
     GROUP BY bucket`

  const byKey = new Map(rows.map((r) => [r.bucket, r]))
  const buckets = AGING_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    invoices: Number(byKey.get(b.key)?.invoices ?? 0),
    outstanding: byKey.get(b.key)?.outstanding ?? '0',
  }))

  const totalOutstanding = buckets
    .reduce((sum, b) => sum.plus(new Prisma.Decimal(b.outstanding)), new Prisma.Decimal(0))
    .toFixed(2)
  // "Overdue" is everything past the 30-day term.
  const overdue = buckets
    .filter((b) => b.key !== 'current')
    .reduce((sum, b) => sum.plus(new Prisma.Decimal(b.outstanding)), new Prisma.Decimal(0))
    .toFixed(2)

  return { buckets, totalOutstanding, overdue }
}

interface CustomerDueRow {
  id: string
  business_name: string
  city: string | null
  state: string | null
  invoices: bigint
  outstanding: string
  oldest_days: number | null
}

/** Outstanding grouped by customer, worst first. */
export async function outstandingByCustomer(limit = 20) {
  const rows = await prisma.$queryRaw<CustomerDueRow[]>`
    WITH outstanding AS (
      SELECT c.id, c.customer_id, c.confirmed_at,
             c.total_amount - COALESCE(SUM(p.amount), 0) AS due
        FROM challans c
        LEFT JOIN payments p ON p.challan_id = c.id
       WHERE c.status = 'CONFIRMED'
       GROUP BY c.id, c.customer_id, c.confirmed_at, c.total_amount
      HAVING c.total_amount - COALESCE(SUM(p.amount), 0) > 0
    )
    SELECT cu.id, cu.business_name, cu.city, cu.state,
           COUNT(o.id)::bigint AS invoices,
           SUM(o.due)::text AS outstanding,
           MAX(CURRENT_DATE - o.confirmed_at::date)::int AS oldest_days
      FROM outstanding o
      JOIN customers cu ON cu.id = o.customer_id
     GROUP BY cu.id, cu.business_name, cu.city, cu.state
     ORDER BY SUM(o.due) DESC
     LIMIT ${limit}`

  return rows.map((r) => ({
    customerId: r.id,
    businessName: r.business_name,
    city: r.city,
    state: r.state,
    invoices: Number(r.invoices),
    outstanding: r.outstanding,
    oldestDays: r.oldest_days ?? 0,
  }))
}

interface OpenInvoiceRow {
  id: string
  challan_number: string
  business_name: string
  customer_id: string
  confirmed_at: Date | null
  total_amount: string
  paid: string
  due: string
  age_days: number | null
}

/** Unsettled confirmed challans, oldest first — the collections worklist. */
export async function openInvoices(params: { limit: number; offset: number; customerId?: string }) {
  const { limit, offset, customerId } = params
  const filter = customerId ? Prisma.sql`AND c.customer_id = ${customerId}::uuid` : Prisma.empty

  const rows = await prisma.$queryRaw<OpenInvoiceRow[]>`
    SELECT c.id, c.challan_number, cu.business_name, c.customer_id, c.confirmed_at,
           c.total_amount::text,
           COALESCE(SUM(p.amount), 0)::text AS paid,
           (c.total_amount - COALESCE(SUM(p.amount), 0))::text AS due,
           (CURRENT_DATE - c.confirmed_at::date)::int AS age_days
      FROM challans c
      JOIN customers cu ON cu.id = c.customer_id
      LEFT JOIN payments p ON p.challan_id = c.id
     WHERE c.status = 'CONFIRMED' ${filter}
     GROUP BY c.id, c.challan_number, cu.business_name, c.customer_id, c.confirmed_at, c.total_amount
    HAVING c.total_amount - COALESCE(SUM(p.amount), 0) > 0
     ORDER BY c.confirmed_at ASC NULLS LAST
     LIMIT ${limit} OFFSET ${offset}`

  const countRows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT c.id
        FROM challans c
        LEFT JOIN payments p ON p.challan_id = c.id
       WHERE c.status = 'CONFIRMED' ${filter}
       GROUP BY c.id, c.total_amount
      HAVING c.total_amount - COALESCE(SUM(p.amount), 0) > 0
    ) t`

  return {
    data: rows.map((r) => ({
      challanId: r.id,
      challanNumber: r.challan_number,
      customerId: r.customer_id,
      businessName: r.business_name,
      confirmedAt: r.confirmed_at,
      total: r.total_amount,
      paid: r.paid,
      due: r.due,
      ageDays: r.age_days ?? 0,
    })),
    total: Number(countRows[0]?.n ?? 0),
  }
}

/** Headline collection figures for the receivables dashboard. */
export async function collectionStats() {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [thisMonth, allTime, avgRows] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: { paidAt: { gte: startOfMonth } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, _count: true }),
    // Average days from invoice to receipt, over settled invoices only —
    // including partly-paid ones would understate it.
    prisma.$queryRaw<{ avg_days: number | null }[]>`
      WITH settled AS (
        SELECT c.id, c.confirmed_at, MAX(p.paid_at) AS last_paid
          FROM challans c
          JOIN payments p ON p.challan_id = c.id
         WHERE c.status = 'CONFIRMED' AND c.confirmed_at IS NOT NULL
         GROUP BY c.id, c.confirmed_at, c.total_amount
        HAVING SUM(p.amount) >= c.total_amount
      )
      SELECT AVG(last_paid::date - confirmed_at::date)::float AS avg_days FROM settled`,
  ])

  return {
    collectedThisMonth: (thisMonth._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    receiptsThisMonth: thisMonth._count,
    collectedAllTime: (allTime._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    receiptsAllTime: allTime._count,
    avgDaysToPay: avgRows[0]?.avg_days != null ? Math.round(avgRows[0].avg_days) : null,
  }
}
