import { Prisma, MovementType, ChallanStatus } from '@prisma/client'
import { prisma } from '../config/prisma'
import { AppError } from '../utils/AppError'
import { GST_RATE, CHALLAN_PREFIX } from '../constants/business'
import type { CreateChallanInput } from '../schemas/challan.schema'

type Tx = Prisma.TransactionClient

/** Atomically pull the next challan sequence value (collision-free under load). */
async function nextChallanSeq(tx: Tx): Promise<number> {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('challan_number_seq') AS nextval`
  return Number(rows[0].nextval)
}

/**
 * Create a DRAFT challan. Line items store immutable snapshots of the product's
 * name / SKU / unit price at creation time, and money totals are computed with
 * Decimal (never float). No stock is touched — that only happens on confirm.
 */
export async function createChallan(input: CreateChallanInput, userId: string) {
  // Merge duplicate product lines (sum quantities) so the unique (challan,product)
  // constraint holds and each product appears once.
  const demand = new Map<string, number>()
  for (const item of input.items) {
    demand.set(item.productId, (demand.get(item.productId) ?? 0) + item.quantity)
  }
  const productIds = [...demand.keys()]

  const [customer, products] = await Promise.all([
    prisma.customer.findUnique({ where: { id: input.customerId } }),
    prisma.product.findMany({ where: { id: { in: productIds } } }),
  ])
  if (!customer) throw AppError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND')

  const productMap = new Map(products.map((p) => [p.id, p]))
  const missing = productIds.filter((id) => !productMap.has(id))
  if (missing.length > 0) {
    throw AppError.badRequest('One or more products do not exist', 'PRODUCT_NOT_FOUND', {
      productIds: missing,
    })
  }

  // Build snapshot line items + Decimal totals.
  const itemsData = productIds.map((id) => {
    const p = productMap.get(id)!
    const quantity = demand.get(id)!
    const lineTotal = p.unitPrice.mul(quantity)
    return {
      productId: id,
      productNameSnapshot: p.name,
      skuSnapshot: p.sku,
      unitPriceSnapshot: p.unitPrice,
      quantity,
      lineTotal,
    }
  })

  const subtotal = itemsData.reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0))
  const taxAmount = subtotal.mul(GST_RATE).toDecimalPlaces(2)
  const totalAmount = subtotal.add(taxAmount)
  const year = (input.date ? new Date(input.date) : new Date()).getFullYear()

  return prisma.$transaction(async (tx) => {
    const seq = await nextChallanSeq(tx)
    const challanNumber = `${CHALLAN_PREFIX}-${year}-${String(seq).padStart(5, '0')}`
    return tx.challan.create({
      data: {
        challanNumber,
        customerId: input.customerId,
        subtotal,
        taxAmount,
        totalAmount,
        status: ChallanStatus.DRAFT,
        createdById: userId,
        items: { create: itemsData },
      },
      include: { items: true, customer: true },
    })
  })
}

interface LockedProduct {
  id: string
  sku: string
  name: string
  stock_quantity: number
}

interface Shortfall {
  productId: string
  sku: string | null
  name: string | null
  requested: number
  available: number
  reason: 'PRODUCT_NOT_FOUND' | 'INSUFFICIENT_STOCK'
}

/**
 * Confirm a DRAFT challan — the critical, concurrency-safe path.
 *
 * Everything runs inside ONE interactive $transaction (ReadCommitted):
 *   1. Lock the challan row FOR UPDATE so two concurrent confirms of the SAME
 *      challan serialize (the loser sees CONFIRMED and is rejected) — this
 *      prevents double stock deduction.
 *   2. Lock EVERY involved product row in a single `... IN (...) ORDER BY id
 *      FOR UPDATE` statement. Ordering by primary key gives a globally
 *      consistent lock order, so concurrent confirms sharing products can never
 *      deadlock.
 *   3. Validate ALL lines against the locked stock and, if any fall short,
 *      throw a 400 whose payload lists EVERY insufficient item → the whole
 *      transaction rolls back and nothing is deducted (no partial writes).
 *   4. Deduct stock, write one CHALLAN_OUT StockLog per line, flip to CONFIRMED.
 *
 * The DB-level CHECK (stock_quantity >= 0) is the final backstop.
 */
export async function confirmChallan(challanId: string, userId: string) {
  return prisma.$transaction(
    async (tx) => {
      // (1) Serialize concurrent confirms of the same challan.
      const lockedChallan = await tx.$queryRaw<{ id: string; status: ChallanStatus }[]>`
        SELECT id, status FROM challans WHERE id = ${challanId}::uuid FOR UPDATE`
      if (lockedChallan.length === 0) {
        throw AppError.notFound('Challan not found', 'CHALLAN_NOT_FOUND')
      }
      const status = lockedChallan[0].status
      if (status === ChallanStatus.CONFIRMED) {
        throw AppError.conflict('Challan is already confirmed', 'ALREADY_CONFIRMED')
      }
      if (status === ChallanStatus.CANCELLED) {
        throw AppError.conflict('Cannot confirm a cancelled challan', 'CHALLAN_CANCELLED')
      }

      const challan = await tx.challan.findUniqueOrThrow({
        where: { id: challanId },
        include: { items: true, customer: true },
      })
      if (challan.items.length === 0) {
        throw AppError.badRequest('Challan has no line items', 'EMPTY_CHALLAN')
      }

      // Aggregate demand and lock all product rows in a deterministic order.
      const demand = new Map<string, number>()
      for (const item of challan.items) {
        demand.set(item.productId, (demand.get(item.productId) ?? 0) + item.quantity)
      }
      const ids = [...demand.keys()].sort()

      // (2) Lock every product row up front, ordered by id (deadlock-free).
      const locked = await tx.$queryRaw<LockedProduct[]>(Prisma.sql`
        SELECT id, sku, name, stock_quantity
        FROM products
        WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY id
        FOR UPDATE
      `)
      const lockedMap = new Map(locked.map((r) => [r.id, r]))

      // (3) Validate ALL lines; collect the COMPLETE shortfall list.
      const insufficient: Shortfall[] = []
      for (const id of ids) {
        const requested = demand.get(id)!
        const row = lockedMap.get(id)
        if (!row) {
          insufficient.push({ productId: id, sku: null, name: null, requested, available: 0, reason: 'PRODUCT_NOT_FOUND' })
        } else if (row.stock_quantity < requested) {
          insufficient.push({
            productId: id,
            sku: row.sku,
            name: row.name,
            requested,
            available: row.stock_quantity,
            reason: 'INSUFFICIENT_STOCK',
          })
        }
      }

      if (insufficient.length > 0) {
        throw AppError.badRequest(
          'Cannot confirm challan — insufficient stock for one or more items',
          'INSUFFICIENT_STOCK',
          { items: insufficient },
        )
      }

      // (4) Safe to mutate: rows are locked and validated.
      const reason = `Challan #${challan.challanNumber} — ${challan.customer.businessName}`
      for (const id of ids) {
        await tx.product.update({
          where: { id },
          data: { stockQuantity: { decrement: demand.get(id)! } },
        })
      }
      await tx.stockLog.createMany({
        data: ids.map((id) => ({
          productId: id,
          quantityChange: -demand.get(id)!,
          movementType: MovementType.CHALLAN_OUT,
          reason,
          userId,
        })),
      })

      return tx.challan.update({
        where: { id: challanId },
        data: { status: ChallanStatus.CONFIRMED, confirmedAt: new Date() },
        include: { items: true, customer: true },
      })
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10_000,
      maxWait: 5_000,
    },
  )
}

/**
 * Cancel a challan. A DRAFT is simply marked CANCELLED. A CONFIRMED challan is
 * reversed: stock is added back and a MANUAL_ADJUST log is written per line —
 * all atomically, with the same challan-first / products-ordered lock discipline.
 */
export async function cancelChallan(challanId: string, userId: string) {
  return prisma.$transaction(
    async (tx) => {
      const lockedChallan = await tx.$queryRaw<{ id: string; status: ChallanStatus }[]>`
        SELECT id, status FROM challans WHERE id = ${challanId}::uuid FOR UPDATE`
      if (lockedChallan.length === 0) {
        throw AppError.notFound('Challan not found', 'CHALLAN_NOT_FOUND')
      }
      const status = lockedChallan[0].status
      if (status === ChallanStatus.CANCELLED) {
        throw AppError.conflict('Challan is already cancelled', 'ALREADY_CANCELLED')
      }

      const challan = await tx.challan.findUniqueOrThrow({
        where: { id: challanId },
        include: { items: true, customer: true },
      })

      if (status === ChallanStatus.CONFIRMED) {
        const demand = new Map<string, number>()
        for (const item of challan.items) {
          demand.set(item.productId, (demand.get(item.productId) ?? 0) + item.quantity)
        }
        const ids = [...demand.keys()].sort()

        // Lock rows (ordered) so the reversal doesn't race a concurrent confirm/adjust.
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM products
          WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
          ORDER BY id
          FOR UPDATE
        `)

        const reason = `Reversal — cancelled Challan #${challan.challanNumber}`
        for (const id of ids) {
          await tx.product.update({
            where: { id },
            data: { stockQuantity: { increment: demand.get(id)! } },
          })
        }
        await tx.stockLog.createMany({
          data: ids.map((id) => ({
            productId: id,
            quantityChange: demand.get(id)!,
            movementType: MovementType.MANUAL_ADJUST,
            reason,
            userId,
          })),
        })
      }

      return tx.challan.update({
        where: { id: challanId },
        data: { status: ChallanStatus.CANCELLED },
        include: { items: true, customer: true },
      })
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000, maxWait: 5_000 },
  )
}
