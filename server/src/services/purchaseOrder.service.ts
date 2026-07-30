import { Prisma, MovementType, PurchaseOrderStatus } from '@prisma/client'
import { prisma } from '../config/prisma'
import { AppError } from '../utils/AppError'
import { GST_RATE, PO_PREFIX, PO_SEQUENCE, GRN_PREFIX, GRN_SEQUENCE } from '../constants/business'
import type { CreatePurchaseOrderInput, ReceiveGoodsInput } from '../schemas/purchaseOrder.schema'

type Tx = Prisma.TransactionClient

/**
 * Atomically pull the next sequence value.
 *
 * $queryRawUnsafe rather than a tagged template because nextval() takes a
 * regclass, not text — a bound parameter would arrive as $1 and fail to resolve.
 * The sequence name is a module constant, never user input, so there is no
 * injection surface. This produces exactly the SQL nextChallanSeq emits.
 */
async function nextSeq(tx: Tx, sequence: string): Promise<number> {
  const rows = await tx.$queryRawUnsafe<{ nextval: bigint }[]>(
    `SELECT nextval('${sequence}') AS nextval`,
  )
  return Number(rows[0].nextval)
}

/**
 * Create a DRAFT purchase order.
 *
 * Mirrors createChallan: duplicate product lines are merged so the unique
 * (purchase_order, product) constraint holds, line items freeze immutable
 * snapshots, and money is Decimal throughout. `unitCost` is what we agreed to
 * pay the supplier — deliberately NOT the product's sale price, which is what
 * the sales side snapshots.
 *
 * No stock moves here. Stock only ever moves on a goods receipt.
 */
export async function createPurchaseOrder(input: CreatePurchaseOrderInput, userId: string) {
  // Merge duplicate lines, keeping the LAST quoted cost for a repeated product.
  const demand = new Map<string, { quantity: number; unitCost: Prisma.Decimal }>()
  for (const item of input.items) {
    const prev = demand.get(item.productId)
    demand.set(item.productId, {
      quantity: (prev?.quantity ?? 0) + item.quantity,
      unitCost: new Prisma.Decimal(item.unitCost.toFixed(2)),
    })
  }
  const productIds = [...demand.keys()]

  const [supplier, products] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: input.supplierId } }),
    prisma.product.findMany({ where: { id: { in: productIds } } }),
  ])
  if (!supplier) throw AppError.notFound('Supplier not found', 'SUPPLIER_NOT_FOUND')
  if (!supplier.isActive) {
    throw AppError.badRequest('Supplier is inactive', 'SUPPLIER_INACTIVE')
  }

  const productMap = new Map(products.map((p) => [p.id, p]))
  const missing = productIds.filter((id) => !productMap.has(id))
  if (missing.length > 0) {
    throw AppError.badRequest('One or more products do not exist', 'PRODUCT_NOT_FOUND', {
      productIds: missing,
    })
  }

  const itemsData = productIds.map((id) => {
    const p = productMap.get(id)!
    const { quantity, unitCost } = demand.get(id)!
    return {
      productId: id,
      productNameSnapshot: p.name,
      skuSnapshot: p.sku,
      unitCost,
      orderedQuantity: quantity,
      receivedQuantity: 0,
      lineTotal: unitCost.mul(quantity),
    }
  })

  const subtotal = itemsData.reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0))
  const taxAmount = subtotal.mul(GST_RATE).toDecimalPlaces(2)
  const totalAmount = subtotal.add(taxAmount)
  const year = new Date().getFullYear()

  return prisma.$transaction(async (tx) => {
    const seq = await nextSeq(tx, PO_SEQUENCE)
    const poNumber = `${PO_PREFIX}-${year}-${String(seq).padStart(5, '0')}`
    return tx.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: input.supplierId,
        status: PurchaseOrderStatus.DRAFT,
        subtotal,
        taxAmount,
        totalAmount,
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        notes: input.notes?.trim() || null,
        createdById: userId,
        items: { create: itemsData },
      },
      include: { items: true, supplier: true },
    })
  })
}

/**
 * DRAFT → SENT. Marks the order as placed with the supplier.
 *
 * Separate from creation so a buyer can build and revise an order before
 * committing to it, and so `sentAt` records when the clock on the expected
 * delivery actually started.
 */
export async function sendPurchaseOrder(purchaseOrderId: string) {
  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; status: PurchaseOrderStatus }[]>`
        SELECT id, status FROM purchase_orders WHERE id = ${purchaseOrderId}::uuid FOR UPDATE`
      if (locked.length === 0) {
        throw AppError.notFound('Purchase order not found', 'PO_NOT_FOUND')
      }
      const status = locked[0].status
      if (status === PurchaseOrderStatus.CANCELLED) {
        throw AppError.conflict('Cannot send a cancelled purchase order', 'PO_CANCELLED')
      }
      if (status !== PurchaseOrderStatus.DRAFT) {
        throw AppError.conflict('Purchase order has already been sent', 'PO_ALREADY_SENT')
      }

      const po = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: purchaseOrderId },
        include: { items: true },
      })
      if (po.items.length === 0) {
        throw AppError.badRequest('Purchase order has no line items', 'EMPTY_PURCHASE_ORDER')
      }

      return tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: PurchaseOrderStatus.SENT, sentAt: new Date() },
        include: { items: true, supplier: true },
      })
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  )
}

interface LockedPoItem {
  id: string
  product_id: string
  sku_snapshot: string
  product_name_snapshot: string
  ordered_quantity: number
  received_quantity: number
}

interface ReceiptProblem {
  purchaseOrderItemId: string
  sku: string | null
  name: string | null
  requested: number
  outstanding: number
  reason: 'LINE_NOT_ON_ORDER' | 'EXCEEDS_OUTSTANDING' | 'LINE_ALREADY_COMPLETE'
}

/**
 * Record a goods receipt against a purchase order — the concurrency-safe path
 * that is the ONLY way stock increases through the application.
 *
 * Everything runs inside ONE interactive $transaction (ReadCommitted):
 *   1. Lock the purchase_orders row FOR UPDATE. Two storemen receiving against
 *      the SAME order serialize here; the second re-reads received quantities
 *      that already include the first, so cumulative receipt can never exceed
 *      what was ordered.
 *   2. Lock the affected purchase_order_items rows, ORDER BY id.
 *   3. Lock every involved product row in one `... IN (...) ORDER BY id FOR
 *      UPDATE`. This matches confirmChallan's product lock ordering exactly, so
 *      a receipt and a challan confirmation touching the same SKUs acquire
 *      product locks in the same sequence and cannot deadlock against each
 *      other.
 *   4. Validate ALL lines against the locked quantities and, if any fail, throw
 *      a 400 listing EVERY problem → the whole transaction rolls back.
 *   5. Increment stock, write one PURCHASE_IN StockLog per line, bump each
 *      line's receivedQuantity, and transition the PO to PARTIALLY_RECEIVED or
 *      RECEIVED depending on whether every line is now complete.
 *
 * The `received_quantity <= ordered_quantity` CHECK is the final backstop.
 */
export async function receiveGoods(input: ReceiveGoodsInput, userId: string) {
  // Merge duplicate lines in the payload before opening a transaction.
  const requested = new Map<string, number>()
  for (const line of input.items) {
    requested.set(
      line.purchaseOrderItemId,
      (requested.get(line.purchaseOrderItemId) ?? 0) + line.quantityReceived,
    )
  }
  if (requested.size === 0) {
    throw AppError.badRequest('Nothing to receive', 'EMPTY_RECEIPT')
  }

  return prisma.$transaction(
    async (tx) => {
      // (1) Serialize concurrent receipts against the same order.
      const lockedPo = await tx.$queryRaw<{ id: string; status: PurchaseOrderStatus }[]>`
        SELECT id, status FROM purchase_orders WHERE id = ${input.purchaseOrderId}::uuid FOR UPDATE`
      if (lockedPo.length === 0) {
        throw AppError.notFound('Purchase order not found', 'PO_NOT_FOUND')
      }
      const status = lockedPo[0].status
      if (status === PurchaseOrderStatus.CANCELLED) {
        throw AppError.conflict('Cannot receive against a cancelled purchase order', 'PO_CANCELLED')
      }
      if (status === PurchaseOrderStatus.RECEIVED) {
        throw AppError.conflict('Purchase order is already fully received', 'PO_ALREADY_RECEIVED')
      }
      if (status === PurchaseOrderStatus.DRAFT) {
        throw AppError.badRequest(
          'Send the purchase order to the supplier before receiving against it',
          'PO_NOT_SENT',
        )
      }

      const po = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: input.purchaseOrderId },
        include: { supplier: true },
      })

      // (2) Lock the order lines being received, in a deterministic order.
      const itemIds = [...requested.keys()].sort()
      const lockedItems = await tx.$queryRaw<LockedPoItem[]>(Prisma.sql`
        SELECT id, product_id, sku_snapshot, product_name_snapshot,
               ordered_quantity, received_quantity
        FROM purchase_order_items
        WHERE id IN (${Prisma.join(itemIds.map((id) => Prisma.sql`${id}::uuid`))})
          AND purchase_order_id = ${input.purchaseOrderId}::uuid
        ORDER BY id
        FOR UPDATE
      `)
      const itemMap = new Map(lockedItems.map((r) => [r.id, r]))

      // (3) Lock the product rows — same ordering discipline as confirmChallan.
      const productIds = [...new Set(lockedItems.map((r) => r.product_id))].sort()
      if (productIds.length > 0) {
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM products
          WHERE id IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))})
          ORDER BY id
          FOR UPDATE
        `)
      }

      // (4) Validate every line; collect the COMPLETE problem list.
      const problems: ReceiptProblem[] = []
      for (const id of itemIds) {
        const qty = requested.get(id)!
        const row = itemMap.get(id)
        if (!row) {
          problems.push({
            purchaseOrderItemId: id,
            sku: null,
            name: null,
            requested: qty,
            outstanding: 0,
            reason: 'LINE_NOT_ON_ORDER',
          })
          continue
        }
        const outstanding = row.ordered_quantity - row.received_quantity
        if (outstanding <= 0) {
          problems.push({
            purchaseOrderItemId: id,
            sku: row.sku_snapshot,
            name: row.product_name_snapshot,
            requested: qty,
            outstanding: 0,
            reason: 'LINE_ALREADY_COMPLETE',
          })
        } else if (qty > outstanding) {
          problems.push({
            purchaseOrderItemId: id,
            sku: row.sku_snapshot,
            name: row.product_name_snapshot,
            requested: qty,
            outstanding,
            reason: 'EXCEEDS_OUTSTANDING',
          })
        }
      }

      if (problems.length > 0) {
        throw AppError.badRequest(
          'Cannot record receipt — one or more lines exceed what is still on order',
          'OVER_RECEIPT',
          { items: problems },
        )
      }

      // (5) Safe to mutate: every row is locked and validated.
      const seq = await nextSeq(tx, GRN_SEQUENCE)
      const receiptNumber = `${GRN_PREFIX}-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`

      const receipt = await tx.goodsReceipt.create({
        data: {
          receiptNumber,
          purchaseOrderId: input.purchaseOrderId,
          supplierRef: input.supplierRef?.trim() || null,
          notes: input.notes?.trim() || null,
          receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
          receivedById: userId,
          items: {
            create: itemIds.map((id) => ({
              purchaseOrderItemId: id,
              productId: itemMap.get(id)!.product_id,
              quantityReceived: requested.get(id)!,
            })),
          },
        },
      })

      // Stock inflow, aggregated per product (a PO can list a product once, but
      // be defensive — two lines could resolve to the same product id).
      const perProduct = new Map<string, number>()
      for (const id of itemIds) {
        const pid = itemMap.get(id)!.product_id
        perProduct.set(pid, (perProduct.get(pid) ?? 0) + requested.get(id)!)
      }

      // This reason string is what makes every PURCHASE_IN row traceable back to
      // a real document — previously stock appeared from nowhere.
      const reason = `${receiptNumber} · PO #${po.poNumber} — ${po.supplier.name}`
      for (const pid of productIds) {
        await tx.product.update({
          where: { id: pid },
          data: { stockQuantity: { increment: perProduct.get(pid)! } },
        })
      }
      await tx.stockLog.createMany({
        data: productIds.map((pid) => ({
          productId: pid,
          quantityChange: perProduct.get(pid)!,
          movementType: MovementType.PURCHASE_IN,
          reason,
          userId,
        })),
      })

      // Bump the denormalised running total on each line, under the same lock.
      for (const id of itemIds) {
        await tx.purchaseOrderItem.update({
          where: { id },
          data: { receivedQuantity: { increment: requested.get(id)! } },
        })
      }

      // Derive the new order status from the post-update line totals.
      const remaining = await tx.purchaseOrderItem.count({
        where: {
          purchaseOrderId: input.purchaseOrderId,
          receivedQuantity: { lt: prisma.purchaseOrderItem.fields.orderedQuantity },
        },
      })
      const complete = remaining === 0

      await tx.purchaseOrder.update({
        where: { id: input.purchaseOrderId },
        data: {
          status: complete ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED,
          closedAt: complete ? new Date() : null,
        },
      })

      return tx.goodsReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: {
          items: true,
          purchaseOrder: { include: { items: true, supplier: true } },
          receivedBy: { select: { name: true } },
        },
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
 * Cancel a purchase order.
 *
 * Deliberately refuses once anything has been physically received: those goods
 * are on the shelf and the stock movements are real, so cancelling would leave
 * the ledger describing an order that supposedly never happened. A partially
 * received order must be closed short instead (not implemented yet) or received
 * in full. A DRAFT or SENT order cancels freely — nothing has moved.
 */
export async function cancelPurchaseOrder(purchaseOrderId: string) {
  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; status: PurchaseOrderStatus }[]>`
        SELECT id, status FROM purchase_orders WHERE id = ${purchaseOrderId}::uuid FOR UPDATE`
      if (locked.length === 0) {
        throw AppError.notFound('Purchase order not found', 'PO_NOT_FOUND')
      }
      const status = locked[0].status
      if (status === PurchaseOrderStatus.CANCELLED) {
        throw AppError.conflict('Purchase order is already cancelled', 'PO_ALREADY_CANCELLED')
      }

      const received = await tx.purchaseOrderItem.count({
        where: { purchaseOrderId, receivedQuantity: { gt: 0 } },
      })
      if (received > 0) {
        throw AppError.conflict(
          'Cannot cancel — goods have already been received against this order',
          'PO_PARTIALLY_RECEIVED',
        )
      }

      return tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: PurchaseOrderStatus.CANCELLED, closedAt: new Date() },
        include: { items: true, supplier: true },
      })
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  )
}

interface DriftRow {
  id: string
  po_number: string
  sku_snapshot: string
  received_quantity: number
  actual_received: number
}

/**
 * Prove the denormalised `receivedQuantity` matches the goods-receipt rows.
 *
 * `receivedQuantity` is a cache maintained inside the receipt transaction, which
 * is what keeps the over-receipt guard and the list queries cheap. A cache that
 * cannot be audited is a liability, so this compares every line against the
 * SUM of its receipt items and reports any drift. It should always return zero
 * rows; if it ever doesn't, the transaction boundary has been broken somewhere.
 */
export async function reconcileReceivedQuantities() {
  const drift = await prisma.$queryRaw<DriftRow[]>`
    SELECT poi.id,
           po.po_number,
           poi.sku_snapshot,
           poi.received_quantity,
           COALESCE(SUM(gri.quantity_received), 0)::int AS actual_received
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.purchase_order_id
      LEFT JOIN goods_receipt_items gri ON gri.purchase_order_item_id = poi.id
     GROUP BY poi.id, po.po_number, poi.sku_snapshot, poi.received_quantity
    HAVING poi.received_quantity <> COALESCE(SUM(gri.quantity_received), 0)`

  const [lines, orders] = await Promise.all([
    prisma.purchaseOrderItem.count(),
    prisma.purchaseOrder.count(),
  ])

  return {
    purchaseOrders: orders,
    linesChecked: lines,
    driftCount: drift.length,
    consistent: drift.length === 0,
    drift: drift.map((d) => ({
      purchaseOrderItemId: d.id,
      poNumber: d.po_number,
      sku: d.sku_snapshot,
      cached: d.received_quantity,
      actual: d.actual_received,
    })),
  }
}

interface OutstandingRow {
  product_id: string
  sku: string
  name: string
  stock_quantity: number
  min_stock: number
  on_order: number
}

/**
 * What is still inbound, per product.
 *
 * The genuinely useful purchasing question: a SKU below its minimum with stock
 * already on order does not need re-ordering, whereas one with nothing inbound
 * does. Reads the cached receivedQuantity rather than aggregating receipts, so
 * it stays a single indexed scan.
 */
export async function outstandingOnOrder(opts: { onlyBelowMin?: boolean } = {}) {
  const belowMinOnly = opts.onlyBelowMin
    ? Prisma.sql`AND p.stock_quantity <= p.min_stock`
    : Prisma.empty

  const rows = await prisma.$queryRaw<OutstandingRow[]>`
    SELECT p.id AS product_id, p.sku, p.name, p.stock_quantity, p.min_stock,
           SUM(poi.ordered_quantity - poi.received_quantity)::int AS on_order
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.purchase_order_id
      JOIN products p ON p.id = poi.product_id
     WHERE po.status IN ('SENT', 'PARTIALLY_RECEIVED')
       AND poi.received_quantity < poi.ordered_quantity
       ${belowMinOnly}
     GROUP BY p.id, p.sku, p.name, p.stock_quantity, p.min_stock
     ORDER BY SUM(poi.ordered_quantity - poi.received_quantity) DESC
     LIMIT 100`

  return rows.map((r) => ({
    productId: r.product_id,
    sku: r.sku,
    name: r.name,
    stockQuantity: r.stock_quantity,
    minStock: r.min_stock,
    onOrder: r.on_order,
  }))
}

/** Headline purchasing figures for the purchase-orders dashboard. */
export async function purchasingStats() {
  const [byStatus, openValue, overdue] = await Promise.all([
    prisma.purchaseOrder.groupBy({ by: ['status'], _count: true }),
    prisma.purchaseOrder.aggregate({
      _sum: { totalAmount: true },
      where: { status: { in: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED] } },
    }),
    prisma.purchaseOrder.count({
      where: {
        status: { in: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED] },
        expectedDate: { lt: new Date() },
      },
    }),
  ])

  const counts: Record<string, number> = {}
  for (const row of byStatus) counts[row.status] = row._count

  return {
    counts,
    openOrders:
      (counts[PurchaseOrderStatus.SENT] ?? 0) + (counts[PurchaseOrderStatus.PARTIALLY_RECEIVED] ?? 0),
    openValue: (openValue._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
    overdueOrders: overdue,
  }
}
