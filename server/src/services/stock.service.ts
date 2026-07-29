import { Prisma, MovementType } from '@prisma/client'
import { prisma } from '../config/prisma'
import { AppError } from '../utils/AppError'
import type { AdjustStockInput } from '../schemas/product.schema'

/**
 * Manual stock adjustment (MANUAL_ADJUST). Locks the product row, applies the
 * signed change, refuses to drive stock below zero, and writes an audit log —
 * all atomically. This is the only non-challan path that mutates stock, and it
 * is restricted to ADMIN / WAREHOUSE at the route layer.
 */
export async function adjustStock(productId: string, input: AdjustStockInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; stock_quantity: number }[]>`
      SELECT id, stock_quantity FROM products WHERE id = ${productId}::uuid FOR UPDATE`
    if (rows.length === 0) {
      throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND')
    }

    const current = rows[0].stock_quantity
    const next = current + input.quantityChange
    if (next < 0) {
      throw AppError.badRequest(
        `Adjustment would drive stock negative (current ${current}, change ${input.quantityChange})`,
        'NEGATIVE_STOCK',
        { current, quantityChange: input.quantityChange },
      )
    }

    const product = await tx.product.update({
      where: { id: productId },
      data: { stockQuantity: next },
    })

    await tx.stockLog.create({
      data: {
        productId,
        quantityChange: input.quantityChange,
        movementType: MovementType.MANUAL_ADJUST,
        reason: input.reason,
        userId,
      },
    })

    return product
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}
