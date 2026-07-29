import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import { paginationMeta, toSkipTake } from '../schemas/common.schema'
import { param } from '../utils/http'
import {
  createChallan as createChallanService,
  confirmChallan as confirmChallanService,
  cancelChallan as cancelChallanService,
} from '../services/challan.service'
import type { CreateChallanInput, ListChallanQuery } from '../schemas/challan.schema'

/**
 * NOTE: The concurrency-critical, ACID transaction logic (stock locking,
 * zero-negative-stock validation, stock deduction + StockLog creation, status
 * transition) lives in `src/services/challan.service.ts`. These controllers are
 * deliberately thin — they translate HTTP <-> the service and never contain
 * business rules, keeping the transaction logic unit-testable in isolation.
 */

/** GET /api/challans — list (financial totals included; WAREHOUSE is blocked at the route). */
export const listChallans = asyncHandler(async (req: Request, res: Response) => {
  const q = req.validatedQuery as ListChallanQuery
  const where: Prisma.ChallanWhereInput = {}
  if (q.status) where.status = q.status
  if (q.customerId) where.customerId = q.customerId
  if (q.search) {
    where.OR = [
      { challanNumber: { contains: q.search, mode: 'insensitive' } },
      { customer: { businessName: { contains: q.search, mode: 'insensitive' } } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.challan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, businessName: true, contactPerson: true } },
        _count: { select: { items: true } },
      },
      ...toSkipTake(q),
    }),
    prisma.challan.count({ where }),
  ])
  res.json({ data, pagination: paginationMeta(q.page, q.limit, total) })
})

/** GET /api/challans/:id — full challan with snapshot line items. */
export const getChallan = asyncHandler(async (req: Request, res: Response) => {
  const challan = await prisma.challan.findUnique({
    where: { id: param(req, 'id') },
    include: { items: true, customer: true, createdBy: { select: { id: true, name: true } } },
  })
  if (!challan) throw AppError.notFound('Challan not found', 'CHALLAN_NOT_FOUND')
  res.json({ data: challan })
})

/** POST /api/challans — create a DRAFT challan (no stock movement). */
export const createChallan = asyncHandler(async (req: Request, res: Response) => {
  const challan = await createChallanService(req.body as CreateChallanInput, req.user!.id)
  res.status(201).json({ data: challan })
})

/**
 * POST /api/challans/:id/confirm — DRAFT -> CONFIRMED.
 * Atomically deducts stock and writes CHALLAN_OUT logs; on insufficient stock
 * returns 400 with the complete list of shortfall items.
 */
export const confirmChallan = asyncHandler(async (req: Request, res: Response) => {
  const challan = await confirmChallanService(param(req, 'id'), req.user!.id)
  res.json({ data: challan, message: 'Challan confirmed and stock deducted' })
})

/** POST /api/challans/:id/cancel — cancels; reverses stock if it was CONFIRMED. */
export const cancelChallan = asyncHandler(async (req: Request, res: Response) => {
  const challan = await cancelChallanService(param(req, 'id'), req.user!.id)
  res.json({ data: challan, message: 'Challan cancelled' })
})
