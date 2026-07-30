import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import { param } from '../utils/http'
import { paginationMeta, toSkipTake } from '../schemas/common.schema'
import {
  recordPayment,
  deletePayment,
  agingSummary,
  outstandingByCustomer,
  openInvoices,
  collectionStats,
} from '../services/payment.service'
import type {
  RecordPaymentBody,
  ListPaymentQuery,
  OpenInvoiceQuery,
} from '../schemas/payment.schema'

/** POST /api/payments — record a receipt (ADMIN, ACCOUNTS). */
export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  const result = await recordPayment(req.body as RecordPaymentBody, req.user!.id)
  res.status(201).json({
    data: result,
    message: result.settled ? 'Payment recorded — invoice settled' : 'Payment recorded',
  })
})

/** GET /api/payments — receipt history. */
export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const q = req.validatedQuery as ListPaymentQuery
  const where: Prisma.PaymentWhereInput = {}
  if (q.challanId) where.challanId = q.challanId
  if (q.customerId) where.customerId = q.customerId
  if (q.method) where.method = q.method
  if (q.search) {
    where.OR = [
      { reference: { contains: q.search, mode: 'insensitive' } },
      { note: { contains: q.search, mode: 'insensitive' } },
      { challan: { challanNumber: { contains: q.search, mode: 'insensitive' } } },
      { customer: { businessName: { contains: q.search, mode: 'insensitive' } } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      include: {
        challan: { select: { challanNumber: true, totalAmount: true } },
        customer: { select: { businessName: true } },
        createdBy: { select: { name: true } },
      },
      ...toSkipTake(q),
    }),
    prisma.payment.count({ where }),
  ])
  res.json({ data, pagination: paginationMeta(q.page, q.limit, total) })
})

/** DELETE /api/payments/:id — reverse a mistaken receipt (ADMIN only). */
export const removePayment = asyncHandler(async (req: Request, res: Response) => {
  const result = await deletePayment(param(req, 'id'))
  res.json({ data: result, message: 'Payment reversed' })
})

/**
 * GET /api/payments/receivables
 *
 * The whole receivables screen in one request: aging buckets, collection stats
 * and the worst-owing customers. Three aggregates over the same tables, so
 * issuing them as one round-trip matters on the free tier.
 */
export const receivables = asyncHandler(async (_req: Request, res: Response) => {
  const [aging, stats, customers] = await Promise.all([
    agingSummary(),
    collectionStats(),
    outstandingByCustomer(10),
  ])
  res.json({ data: { aging, stats, topCustomers: customers } })
})

/** GET /api/payments/open-invoices — the collections worklist, oldest first. */
export const listOpenInvoices = asyncHandler(async (req: Request, res: Response) => {
  const q = req.validatedQuery as OpenInvoiceQuery
  const { skip, take } = toSkipTake(q)
  const { data, total } = await openInvoices({
    limit: take,
    offset: skip,
    customerId: q.customerId,
  })
  res.json({ data, pagination: paginationMeta(q.page, q.limit, total) })
})

/**
 * GET /api/challans/:id/payment-summary
 *
 * Paid/outstanding for one challan — used by the record-payment dialog and the
 * printed invoice. Derived, never read from a cached column.
 */
export const challanPaymentSummary = asyncHandler(async (req: Request, res: Response) => {
  const id = param(req, 'id')
  const challan = await prisma.challan.findUnique({
    where: { id },
    select: { id: true, challanNumber: true, totalAmount: true, status: true },
  })
  if (!challan) throw AppError.notFound('Challan not found', 'CHALLAN_NOT_FOUND')

  const [agg, payments] = await Promise.all([
    prisma.payment.aggregate({ where: { challanId: id }, _sum: { amount: true } }),
    prisma.payment.findMany({
      where: { challanId: id },
      orderBy: { paidAt: 'desc' },
      include: { createdBy: { select: { name: true } } },
    }),
  ])

  const paid = agg._sum.amount ?? new Prisma.Decimal(0)
  const outstanding = challan.totalAmount.minus(paid)

  res.json({
    data: {
      challanId: challan.id,
      challanNumber: challan.challanNumber,
      status: challan.status,
      total: challan.totalAmount.toFixed(2),
      paid: paid.toFixed(2),
      outstanding: outstanding.toFixed(2),
      settled: outstanding.lte(0),
      payments,
    },
  })
})
