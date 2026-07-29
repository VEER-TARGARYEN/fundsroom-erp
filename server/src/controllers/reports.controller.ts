import type { Request, Response } from 'express'
import { prisma } from '../config/prisma'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import type { Role } from '@prisma/client'

const CRM_ROLES: Role[] = ['ADMIN', 'SALES', 'ACCOUNTS']
const PRODUCT_ROLES: Role[] = ['ADMIN', 'SALES', 'WAREHOUSE']

/** How many rows each "top N" chart shows. */
const TOP_N = 6

interface Bucket {
  label: string
  value: string
}

/**
 * GET /api/reports/summary
 *
 * Every figure on the Reports screen, aggregated in the database.
 *
 * This replaces client-side aggregation over `products?limit=100` and
 * `challans?limit=100`, which silently computed totals from only the first
 * page — with 306 products the page reported ₹17Cr of inventory against a true
 * ₹49Cr, and disagreed with the dashboard. Aggregates belong next to the data.
 */
export const reportsSummary = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const { role } = req.user

  const canCRM = CRM_ROLES.includes(role)
  const canProducts = PRODUCT_ROLES.includes(role)

  const [
    inventoryRows,
    lowStockCount,
    productCount,
    byCategoryRows,
    topProductRows,
    salesRows,
    confirmedCount,
    draftCount,
    cancelledCount,
    topCustomerRows,
  ] = await Promise.all([
    canProducts
      ? prisma.$queryRaw<{ value: string }[]>`
          SELECT COALESCE(SUM(unit_price * stock_quantity), 0)::text AS value FROM products`
      : null,
    canProducts
      ? prisma.product.count({ where: { stockQuantity: { lte: prisma.product.fields.minStock } } })
      : null,
    canProducts ? prisma.product.count() : null,
    canProducts
      ? prisma.$queryRaw<Bucket[]>`
          SELECT category AS label, SUM(unit_price * stock_quantity)::text AS value
            FROM products GROUP BY category ORDER BY SUM(unit_price * stock_quantity) DESC`
      : null,
    canProducts
      ? prisma.$queryRaw<Bucket[]>`
          SELECT name AS label, (unit_price * stock_quantity)::text AS value
            FROM products ORDER BY unit_price * stock_quantity DESC LIMIT ${TOP_N}`
      : null,

    canCRM
      ? prisma.challan.aggregate({ _sum: { totalAmount: true }, where: { status: 'CONFIRMED' } })
      : null,
    canCRM ? prisma.challan.count({ where: { status: 'CONFIRMED' } }) : null,
    canCRM ? prisma.challan.count({ where: { status: 'DRAFT' } }) : null,
    canCRM ? prisma.challan.count({ where: { status: 'CANCELLED' } }) : null,
    canCRM
      ? prisma.$queryRaw<Bucket[]>`
          SELECT c.business_name AS label, SUM(ch.total_amount)::text AS value
            FROM challans ch
            JOIN customers c ON c.id = ch.customer_id
           WHERE ch.status = 'CONFIRMED'
           GROUP BY c.business_name
           ORDER BY SUM(ch.total_amount) DESC
           LIMIT ${TOP_N}`
      : null,
  ])

  res.json({
    data: {
      products: canProducts
        ? {
            total: productCount,
            lowStock: lowStockCount,
            inventoryValue: inventoryRows?.[0]?.value ?? '0',
            byCategory: byCategoryRows ?? [],
            topByStockValue: topProductRows ?? [],
          }
        : null,
      sales: canCRM
        ? {
            value: salesRows?._sum.totalAmount?.toString() ?? '0',
            confirmed: confirmedCount,
            draft: draftCount,
            cancelled: cancelledCount,
            topCustomers: topCustomerRows ?? [],
          }
        : null,
    },
  })
})

/** RFC4180-ish escaping: quote anything containing a comma, quote or newline. */
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function toCsv(header: string[], rows: unknown[][]): string {
  return [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n')
}

/**
 * GET /api/reports/products.csv — the whole catalogue in one response.
 *
 * Exporting from the client would have meant paginating the 100-row list
 * endpoint (four requests here, ~180 for sales), so the export is built here
 * where the full table is one query away.
 */
export const exportProductsCsv = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  if (!PRODUCT_ROLES.includes(req.user.role)) throw AppError.forbidden()

  const products = await prisma.product.findMany({ orderBy: { sku: 'asc' } })
  const csv = toCsv(
    ['SKU', 'Name', 'Category', 'Unit Price', 'Stock', 'Min Stock', 'Stock Value', 'Warehouse'],
    products.map((p) => [
      p.sku, p.name, p.category, p.unitPrice.toString(), p.stockQuantity, p.minStock,
      p.unitPrice.mul(p.stockQuantity).toFixed(2), p.warehouseLocation,
    ]),
  )
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="fundsroom-products.csv"')
  res.send(csv)
})

/** GET /api/reports/sales.csv — every confirmed challan with its customer. */
export const exportSalesCsv = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  if (!CRM_ROLES.includes(req.user.role)) throw AppError.forbidden()

  const challans = await prisma.challan.findMany({
    where: { status: 'CONFIRMED' },
    orderBy: { confirmedAt: 'desc' },
    include: { customer: { select: { businessName: true, gstin: true, city: true } } },
  })
  const csv = toCsv(
    ['Challan No.', 'Customer', 'GSTIN', 'City', 'Subtotal', 'Tax', 'Total', 'Confirmed At'],
    challans.map((c) => [
      c.challanNumber, c.customer.businessName, c.customer.gstin ?? '', c.customer.city ?? '',
      c.subtotal.toString(), c.taxAmount.toString(), c.totalAmount.toString(),
      c.confirmedAt?.toISOString() ?? '',
    ]),
  )
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="fundsroom-sales.csv"')
  res.send(csv)
})
