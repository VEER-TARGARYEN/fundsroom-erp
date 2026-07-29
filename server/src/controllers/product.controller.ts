import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import { paginationMeta, toSkipTake } from '../schemas/common.schema'
import { adjustStock } from '../services/stock.service'
import { param } from '../utils/http'
import type {
  AdjustStockInput,
  CreateProductInput,
  ListProductQuery,
  UpdateProductInput,
} from '../schemas/product.schema'

/** GET /api/products — paginated, searchable, with category + lowStock filters. */
export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const q = req.validatedQuery as ListProductQuery
  const where: Prisma.ProductWhereInput = {}
  if (q.category) where.category = q.category
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { sku: { contains: q.search, mode: 'insensitive' } },
    ]
  }
  // lowStock = stock at or below the reorder threshold.
  if (q.lowStock) where.stockQuantity = { lte: prisma.product.fields.minStock }

  const [data, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(q) }),
    prisma.product.count({ where }),
  ])
  res.json({ data, pagination: paginationMeta(q.page, q.limit, total) })
})

/** GET /api/products/:id */
export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await prisma.product.findUnique({ where: { id: param(req, 'id') } })
  if (!product) throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND')
  res.json({ data: product })
})

/** POST /api/products */
export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await prisma.product.create({ data: req.body as CreateProductInput })
  res.status(201).json({ data: product })
})

/** PATCH /api/products/:id */
export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await prisma.product.update({
    where: { id: param(req, 'id') },
    data: req.body as UpdateProductInput,
  })
  res.json({ data: product })
})

/**
 * POST /api/products/:id/adjust-stock — MANUAL_ADJUST.
 * ADMIN / WAREHOUSE only (enforced at the route). This is the guarded path that
 * lets stock be changed without a challan; SALES is intentionally excluded.
 */
export const adjustProductStock = asyncHandler(async (req: Request, res: Response) => {
  const product = await adjustStock(param(req, 'id'), req.body as AdjustStockInput, req.user!.id)
  res.json({ data: product })
})
