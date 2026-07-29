import type { Request, Response } from 'express'
import { prisma } from '../config/prisma'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import type { Role } from '@prisma/client'

const CRM_ROLES: Role[] = ['ADMIN', 'SALES', 'ACCOUNTS']
const PRODUCT_ROLES: Role[] = ['ADMIN', 'SALES', 'WAREHOUSE']
const LEDGER_ROLES: Role[] = ['ADMIN', 'WAREHOUSE']

/**
 * GET /api/dashboard/summary
 *
 * One request replacing the seven the dashboard used to fan out (five counts, a
 * 100-row product page, and a recent-activity page). Every figure is computed
 * server-side in a single `Promise.all`, which matters on the free tier: the
 * Neon instance is 0.25 vCPU and each extra round-trip was ~490ms.
 *
 * It also fixes a correctness bug — inventory value was previously summed in the
 * browser over only the first 100 products, so it silently under-reported once
 * the catalogue outgrew a page. `SUM(unit_price * stock_quantity)` covers all rows.
 *
 * Sections are gated by role and omitted (null) when not permitted, mirroring
 * exactly what each role could already see, so this is not a privilege change.
 */
export const dashboardSummary = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const { role } = req.user

  const canCRM = CRM_ROLES.includes(role)
  const canProducts = PRODUCT_ROLES.includes(role)
  const canLedger = LEDGER_ROLES.includes(role)

  const [
    customerTotal,
    customerActive,
    customerLeads,
    productTotal,
    productLowStock,
    productOutOfStock,
    inventoryValueRows,
    challanDraft,
    challanConfirmed,
    challanCancelled,
    recentChallans,
    recentStockLogs,
  ] = await Promise.all([
    canCRM ? prisma.customer.count() : null,
    canCRM ? prisma.customer.count({ where: { status: 'ACTIVE' } }) : null,
    canCRM ? prisma.customer.count({ where: { status: 'LEAD' } }) : null,

    canProducts ? prisma.product.count() : null,
    canProducts
      ? prisma.product.count({ where: { stockQuantity: { lte: prisma.product.fields.minStock } } })
      : null,
    canProducts ? prisma.product.count({ where: { stockQuantity: 0 } }) : null,
    canProducts
      ? prisma.$queryRaw<{ value: string }[]>`
          SELECT COALESCE(SUM(unit_price * stock_quantity), 0)::text AS value FROM products`
      : null,

    canCRM ? prisma.challan.count({ where: { status: 'DRAFT' } }) : null,
    canCRM ? prisma.challan.count({ where: { status: 'CONFIRMED' } }) : null,
    canCRM ? prisma.challan.count({ where: { status: 'CANCELLED' } }) : null,

    canCRM
      ? prisma.challan.findMany({
          take: 6,
          orderBy: { createdAt: 'desc' },
          include: { customer: { select: { id: true, businessName: true } } },
        })
      : null,
    canLedger
      ? prisma.stockLog.findMany({
          take: 6,
          orderBy: { createdAt: 'desc' },
          include: {
            product: { select: { sku: true, name: true } },
            user: { select: { name: true } },
          },
        })
      : null,
  ])

  res.json({
    data: {
      customers: canCRM
        ? { total: customerTotal, active: customerActive, leads: customerLeads }
        : null,
      products: canProducts
        ? {
            total: productTotal,
            lowStock: productLowStock,
            outOfStock: productOutOfStock,
            inventoryValue: inventoryValueRows?.[0]?.value ?? '0',
          }
        : null,
      challans: canCRM
        ? { draft: challanDraft, confirmed: challanConfirmed, cancelled: challanCancelled }
        : null,
      recentChallans,
      recentStockLogs,
    },
  })
})
