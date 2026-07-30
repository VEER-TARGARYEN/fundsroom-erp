import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import { param } from '../utils/http'
import { paginationMeta, toSkipTake } from '../schemas/common.schema'
import {
  createPurchaseOrder,
  sendPurchaseOrder,
  receiveGoods,
  cancelPurchaseOrder,
  reconcileReceivedQuantities,
  outstandingOnOrder,
  purchasingStats,
} from '../services/purchaseOrder.service'
import type {
  CreatePurchaseOrderInput,
  ReceiveGoodsInput,
  ListPurchaseOrderQuery,
  CreateSupplierInput,
  UpdateSupplierInput,
  ListSupplierQuery,
  OutstandingQuery,
} from '../schemas/purchaseOrder.schema'

// ── Suppliers ───────────────────────────────────────────────────────────────

/** Empty strings from optional form fields become NULL, not ''. */
function blankToNull<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj }
  for (const [k, v] of Object.entries(out)) {
    if (v === '') (out as Record<string, unknown>)[k] = null
  }
  return out
}

/** GET /api/suppliers */
export const listSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const q = req.validatedQuery as ListSupplierQuery
  const where: Prisma.SupplierWhereInput = {}
  if (q.isActive !== undefined) where.isActive = q.isActive
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { contactPerson: { contains: q.search, mode: 'insensitive' } },
      { gstin: { contains: q.search, mode: 'insensitive' } },
      { city: { contains: q.search, mode: 'insensitive' } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { purchaseOrders: true } } },
      ...toSkipTake(q),
    }),
    prisma.supplier.count({ where }),
  ])
  res.json({ data, pagination: paginationMeta(q.page, q.limit, total) })
})

/** GET /api/suppliers/:id */
export const getSupplier = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: param(req, 'id') },
    include: {
      purchaseOrders: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          poNumber: true,
          status: true,
          totalAmount: true,
          expectedDate: true,
          createdAt: true,
        },
      },
    },
  })
  if (!supplier) throw AppError.notFound('Supplier not found', 'SUPPLIER_NOT_FOUND')
  res.json({ data: supplier })
})

/** POST /api/suppliers */
export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const body = blankToNull(req.body as CreateSupplierInput)
  const supplier = await prisma.supplier.create({ data: body as Prisma.SupplierCreateInput })
  res.status(201).json({ data: supplier, message: 'Supplier created' })
})

/** PATCH /api/suppliers/:id */
export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  const id = param(req, 'id')
  const existing = await prisma.supplier.findUnique({ where: { id } })
  if (!existing) throw AppError.notFound('Supplier not found', 'SUPPLIER_NOT_FOUND')

  const body = blankToNull(req.body as UpdateSupplierInput)
  const supplier = await prisma.supplier.update({
    where: { id },
    data: body as Prisma.SupplierUpdateInput,
  })
  res.json({ data: supplier, message: 'Supplier updated' })
})

// ── Purchase orders ─────────────────────────────────────────────────────────

/** GET /api/purchase-orders */
export const listPurchaseOrders = asyncHandler(async (req: Request, res: Response) => {
  const q = req.validatedQuery as ListPurchaseOrderQuery
  const where: Prisma.PurchaseOrderWhereInput = {}
  if (q.status) where.status = q.status
  if (q.supplierId) where.supplierId = q.supplierId
  if (q.overdue) {
    // Overdue means still awaiting goods AND past the promised date.
    where.status = { in: ['SENT', 'PARTIALLY_RECEIVED'] }
    where.expectedDate = { lt: new Date() }
  }
  if (q.search) {
    where.OR = [
      { poNumber: { contains: q.search, mode: 'insensitive' } },
      { supplier: { name: { contains: q.search, mode: 'insensitive' } } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: { select: { id: true, name: true } },
        _count: { select: { items: true, receipts: true } },
      },
      ...toSkipTake(q),
    }),
    prisma.purchaseOrder.count({ where }),
  ])
  res.json({ data, pagination: paginationMeta(q.page, q.limit, total) })
})

/** GET /api/purchase-orders/:id — full order with lines and receipt history. */
export const getPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: param(req, 'id') },
    include: {
      supplier: true,
      createdBy: { select: { id: true, name: true } },
      items: { orderBy: { skuSnapshot: 'asc' } },
      receipts: {
        orderBy: { receivedAt: 'desc' },
        include: {
          items: true,
          receivedBy: { select: { name: true } },
        },
      },
    },
  })
  if (!po) throw AppError.notFound('Purchase order not found', 'PO_NOT_FOUND')
  res.json({ data: po })
})

/** POST /api/purchase-orders */
export const createPo = asyncHandler(async (req: Request, res: Response) => {
  const po = await createPurchaseOrder(req.body as CreatePurchaseOrderInput, req.user!.id)
  res.status(201).json({ data: po, message: `Purchase order ${po.poNumber} created` })
})

/** POST /api/purchase-orders/:id/send */
export const sendPo = asyncHandler(async (req: Request, res: Response) => {
  const po = await sendPurchaseOrder(param(req, 'id'))
  res.json({ data: po, message: `Purchase order ${po.poNumber} sent to supplier` })
})

/** POST /api/purchase-orders/:id/cancel */
export const cancelPo = asyncHandler(async (req: Request, res: Response) => {
  const po = await cancelPurchaseOrder(param(req, 'id'))
  res.json({ data: po, message: `Purchase order ${po.poNumber} cancelled` })
})

/**
 * POST /api/purchase-orders/receive
 *
 * The one endpoint that increases stock. Body carries the PO id and the lines
 * actually delivered, so a partial delivery is the normal case rather than a
 * special one.
 */
export const receive = asyncHandler(async (req: Request, res: Response) => {
  const receipt = await receiveGoods(req.body as ReceiveGoodsInput, req.user!.id)
  const status = receipt.purchaseOrder.status
  res.status(201).json({
    data: receipt,
    message:
      status === 'RECEIVED'
        ? `${receipt.receiptNumber} recorded — order fully received`
        : `${receipt.receiptNumber} recorded — order partially received`,
  })
})

/** GET /api/purchase-orders/stats */
export const stats = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await purchasingStats() })
})

/** GET /api/purchase-orders/outstanding — what is still inbound, per product. */
export const outstanding = asyncHandler(async (req: Request, res: Response) => {
  const q = req.validatedQuery as OutstandingQuery
  res.json({ data: await outstandingOnOrder({ onlyBelowMin: q.onlyBelowMin }) })
})

/**
 * GET /api/purchase-orders/reconcile
 *
 * Audits the denormalised receivedQuantity against the goods-receipt rows.
 * Should always report consistent: true. Exposed rather than kept as a script
 * so the cache is verifiable in the deployed environment, not just locally.
 */
export const reconcile = asyncHandler(async (_req: Request, res: Response) => {
  const result = await reconcileReceivedQuantities()
  res.json({
    data: result,
    message: result.consistent
      ? `All ${result.linesChecked} order lines reconcile with their goods receipts`
      : `${result.driftCount} line(s) drifted from their receipt totals`,
  })
})
