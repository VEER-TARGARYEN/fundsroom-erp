import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { asyncHandler } from '../utils/asyncHandler'
import { paginationMeta, toSkipTake } from '../schemas/common.schema'
import type { ListStockLogQuery } from '../schemas/stockLog.schema'

/**
 * GET /api/stock-logs — the immutable movement ledger.
 * ADMIN / WAREHOUSE only (enforced at the route).
 */
export const listStockLogs = asyncHandler(async (req: Request, res: Response) => {
  const q = req.validatedQuery as ListStockLogQuery
  const where: Prisma.StockLogWhereInput = {}
  if (q.productId) where.productId = q.productId
  if (q.movementType) where.movementType = q.movementType
  if (q.search) {
    where.OR = [
      { reason: { contains: q.search, mode: 'insensitive' } },
      { product: { sku: { contains: q.search, mode: 'insensitive' } } },
      { product: { name: { contains: q.search, mode: 'insensitive' } } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.stockLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { sku: true, name: true } },
        user: { select: { name: true } },
      },
      ...toSkipTake(q),
    }),
    prisma.stockLog.count({ where }),
  ])
  res.json({ data, pagination: paginationMeta(q.page, q.limit, total) })
})
