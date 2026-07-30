import 'dotenv/config'
import { PrismaClient, Prisma, type ChallanStatus, type MovementType, type PaymentMethod } from '@prisma/client'
import { CHALLAN_PREFIX, CHALLAN_SEQUENCE, GST_RATE } from '../constants/business'

/**
 * Bulk demo-data generator — turns the 3-customer starter seed into a dataset
 * that looks and behaves like a real wholesale business.
 *
 * Scale is parameterised so the same script works on a bigger plan; the
 * defaults are sized for Neon's free tier (~0.5 GB, shared with another app on
 * this instance) and land around 150k rows / ~45 MB:
 *
 *   DEMO_CUSTOMERS=500 DEMO_PRODUCTS=300 DEMO_CHALLANS=25000 npm run db:seed:demo
 *
 * Set DEMO_RESET=true to clear previously generated rows first. Reset only ever
 * touches this schema's own tables and always preserves the original starter
 * seed (6 SKUs / 3 businesses) — the auth tables belonging to the other
 * application sharing this database are never referenced.
 *
 * Everything is deterministic (seeded PRNG), so a given scale reproduces the
 * same dataset and re-running is predictable.
 */

const prisma = new PrismaClient()

const N_CUSTOMERS = Number(process.env.DEMO_CUSTOMERS ?? 500)
const N_PRODUCTS = Number(process.env.DEMO_PRODUCTS ?? 300)
const N_CHALLANS = Number(process.env.DEMO_CHALLANS ?? 25_000)
const RESET = process.env.DEMO_RESET === 'true'
/** Kept modest so a single INSERT payload stays comfortable over the wire. */
const BATCH = 2_000

/** Rows carried over from the starter seed that reset must never delete. */
const KEEP_SKUS = ['ELEC-1001', 'ELEC-1002', 'GROC-2002', 'HARD-4002', 'STAT-5001', 'BEVG-6001']
const KEEP_BUSINESSES = ['Acme Traders', 'Metro Distributors', 'Sunrise Retail Mart']

// ── deterministic PRNG (mulberry32) ─────────────────────────────────────────
let _s = 0x9e3779b9
function rnd(): number {
  _s = (_s + 0x6d2b79f5) | 0
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1))

// ── source vocabulary ───────────────────────────────────────────────────────
const CITIES = [
  ['Mumbai', 'Maharashtra', '4000'], ['Pune', 'Maharashtra', '4110'],
  ['New Delhi', 'Delhi', '1100'], ['Gurugram', 'Haryana', '1220'],
  ['Bengaluru', 'Karnataka', '5600'], ['Mysuru', 'Karnataka', '5700'],
  ['Ahmedabad', 'Gujarat', '3800'], ['Surat', 'Gujarat', '3950'],
  ['Chennai', 'Tamil Nadu', '6000'], ['Coimbatore', 'Tamil Nadu', '6410'],
  ['Hyderabad', 'Telangana', '5000'], ['Kolkata', 'West Bengal', '7000'],
  ['Jaipur', 'Rajasthan', '3020'], ['Lucknow', 'Uttar Pradesh', '2260'],
  ['Indore', 'Madhya Pradesh', '4520'], ['Kochi', 'Kerala', '6820'],
  ['Bhubaneswar', 'Odisha', '7510'], ['Chandigarh', 'Punjab', '1600'],
  ['Nagpur', 'Maharashtra', '4400'], ['Visakhapatnam', 'Andhra Pradesh', '5300'],
] as const
const GST_STATE = ['27', '07', '29', '24', '33', '36', '19', '08', '09', '23', '32', '21', '04', '37']
const BIZ_A = ['Shree', 'Sai', 'Balaji', 'Krishna', 'Ganesh', 'Laxmi', 'Metro', 'Global', 'Prime', 'Unity', 'Apex', 'Nova', 'Sunrise', 'Royal', 'Star', 'Bharat', 'National', 'Supreme', 'Elite', 'Pioneer']
const BIZ_B = ['Traders', 'Distributors', 'Enterprises', 'Agencies', 'Trading Co', 'Wholesale', 'Marketing', 'Supplies', 'Retail Mart', 'Corporation', 'Industries', 'Sales', 'Depot', 'Stores']
const FIRST = ['Rahul', 'Priya', 'Amit', 'Sana', 'Vikram', 'Neha', 'Arjun', 'Kavita', 'Rohan', 'Anjali', 'Sanjay', 'Meera', 'Karan', 'Divya', 'Aditya', 'Pooja', 'Manish', 'Ritu', 'Suresh', 'Nisha']
const LAST = ['Sharma', 'Khan', 'Patel', 'Nair', 'Das', 'Kapoor', 'Mehta', 'Reddy', 'Singh', 'Gupta', 'Iyer', 'Joshi', 'Rao', 'Verma', 'Shah', 'Bose', 'Menon', 'Chopra']

const CATALOG: Record<string, { prefix: string; items: string[]; lo: number; hi: number }> = {
  Electronics: { prefix: 'ELEC', lo: 299, hi: 24_999, items: ['USB-C Fast Charger', 'Wireless Mouse', 'Bluetooth Speaker', 'HDMI Cable 2m', 'Power Bank 20000mAh', 'Laptop Stand', 'Webcam 1080p', 'Mechanical Keyboard', 'Surge Protector', 'LED Monitor 24in', 'Earbuds Pro', 'Router Dual-Band'] },
  Groceries: { prefix: 'GROC', lo: 45, hi: 3_200, items: ['Refined Sunflower Oil', 'Basmati Rice 10kg', 'Wheat Flour 10kg', 'Toor Dal 5kg', 'Sugar 5kg', 'Iodised Salt 1kg', 'Mustard Oil 5L', 'Chana Dal 5kg', 'Poha 2kg', 'Jaggery 2kg'] },
  Apparel: { prefix: 'APRL', lo: 199, hi: 4_500, items: ['Cotton T-Shirt', 'Denim Jeans', 'Formal Shirt', 'Woollen Sweater', 'Track Pants', 'Cotton Saree', 'Kurta Set', 'Windcheater', 'Socks Pack', 'Leather Belt'] },
  Hardware: { prefix: 'HARD', lo: 89, hi: 8_900, items: ['Stainless Screw Set', 'Cordless Drill', 'Hammer 500g', 'Measuring Tape 5m', 'Spanner Set', 'Angle Grinder', 'Paint Brush Set', 'Safety Gloves', 'Ladder 6ft', 'Tool Box'] },
  Stationery: { prefix: 'STAT', lo: 25, hi: 1_800, items: ['A4 Copier Paper', 'Gel Pen Pack', 'Spiral Notebook', 'Stapler Heavy Duty', 'File Folder Pack', 'Whiteboard Marker', 'Sticky Notes', 'Scissors 8in', 'Calculator 12-digit', 'Envelope Pack'] },
  Beverages: { prefix: 'BEVG', lo: 60, hi: 2_400, items: ['Instant Coffee Jar', 'Green Tea Bags', 'Mango Juice 1L', 'Cola 2L Pack', 'Energy Drink Pack', 'Masala Chai 500g', 'Mineral Water Case', 'Lemon Soda Pack'] },
  Packaging: { prefix: 'PACK', lo: 35, hi: 5_600, items: ['Corrugated Box Medium', 'Bubble Wrap Roll', 'Packing Tape', 'Stretch Film Roll', 'Courier Bag Pack', 'Paper Carry Bag', 'Thermocol Sheet', 'Strapping Roll'] },
}
const WAREHOUSES = ['Mumbai Hub', 'Delhi DC', 'Bengaluru DC']
const SIZES = ['500g', '1kg', '2kg', '5L', '15L', '30W', '60W', 'Small', 'Medium', 'Large', 'Pack of 10', 'Pack of 50', 'Ream', '500 pc']

function d2(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2))
}

async function chunked<T>(rows: T[], fn: (c: T[]) => Promise<unknown>, label: string) {
  for (let i = 0; i < rows.length; i += BATCH) {
    await fn(rows.slice(i, i + BATCH))
    process.stdout.write(`\r   ${label}: ${Math.min(i + BATCH, rows.length)}/${rows.length}   `)
  }
  process.stdout.write('\n')
}

async function main() {
  const t0 = Date.now()
  console.log(`\n🌱 Generating demo data — ${N_CUSTOMERS} customers, ${N_PRODUCTS} products, ${N_CHALLANS} challans\n`)

  if (RESET) {
    console.log('   DEMO_RESET=true — clearing generated rows (starter seed preserved)')
    await prisma.payment.deleteMany({})
    await prisma.challanItem.deleteMany({})
    await prisma.challan.deleteMany({})
    await prisma.stockLog.deleteMany({})
    await prisma.product.deleteMany({ where: { sku: { notIn: KEEP_SKUS } } })
    await prisma.customer.deleteMany({ where: { businessName: { notIn: KEEP_BUSINESSES } } })
    await prisma.$executeRawUnsafe(`SELECT setval('${CHALLAN_SEQUENCE}', 1, false)`)
  }

  const users = await prisma.user.findMany({ select: { id: true, role: true } })
  if (users.length === 0) throw new Error('No users found — run `npm run db:seed` first.')
  const creatorIds = users.filter((u) => u.role === 'ADMIN' || u.role === 'SALES').map((u) => u.id)
  const actorIds = users.map((u) => u.id)

  // ── customers ─────────────────────────────────────────────────────────────
  const customerRows: Prisma.CustomerCreateManyInput[] = []
  const usedNames = new Set(KEEP_BUSINESSES)
  for (let i = 0; customerRows.length < N_CUSTOMERS && i < N_CUSTOMERS * 6; i++) {
    const name = `${pick(BIZ_A)} ${pick(BIZ_B)}`
    const unique = usedNames.has(name) ? `${name} ${pick(CITIES)[0]}` : name
    if (usedNames.has(unique)) continue
    usedNames.add(unique)

    const [city, state, pin] = pick(CITIES)
    const first = pick(FIRST)
    const last = pick(LAST)
    // Weighted so the mix looks like a real book: mostly active, some leads.
    const r = rnd()
    const status = r < 0.62 ? 'ACTIVE' : r < 0.85 ? 'LEAD' : 'INACTIVE'
    const type = rnd() < 0.7 ? 'WHOLESALE' : 'RETAIL'
    const hasGstin = type === 'WHOLESALE' || rnd() < 0.4
    const slug = unique.toLowerCase().replace(/[^a-z0-9]+/g, '')

    customerRows.push({
      businessName: unique,
      contactPerson: `${first} ${last}`,
      mobile: `${pick(['9', '8', '7'])}${int(100000000, 999999999)}`.slice(0, 10),
      email: rnd() < 0.85 ? `${first.toLowerCase()}@${slug.slice(0, 18)}.in` : null,
      gstin: hasGstin
        ? `${pick(GST_STATE)}${slug.slice(0, 5).toUpperCase().padEnd(5, 'A')}${int(1000, 9999)}${pick(['F', 'L', 'M', 'K'])}1Z${int(0, 9)}`
        : null,
      type,
      status,
      notes: rnd() < 0.3 ? pick(['Prefers monthly billing.', 'Credit terms: 30 days.', 'Bulk buyer — quarterly orders.', 'Requires GST invoice copy.', 'Contact only after 4 PM.']) : null,
      // Leads carry a follow-up date; some are deliberately overdue so the
      // notification agent has real work to detect.
      followUpDate:
        status === 'LEAD'
          ? new Date(Date.now() + int(-25, 30) * 86_400_000)
          : rnd() < 0.15
            ? new Date(Date.now() + int(-10, 45) * 86_400_000)
            : null,
      addressLine1: `${int(1, 400)} ${pick(['MG Road', 'Ring Road', 'Station Road', 'Industrial Area', 'Market Lane', 'Sector 18', 'Anna Salai', 'Link Road'])}`,
      city,
      state,
      pincode: `${pin}${int(10, 99)}`,
    })
  }
  await chunked(customerRows, (c) => prisma.customer.createMany({ data: c, skipDuplicates: true }), 'customers')

  // ── products ──────────────────────────────────────────────────────────────
  const productRows: Prisma.ProductCreateManyInput[] = []
  const usedSku = new Set(KEEP_SKUS)
  const categories = Object.keys(CATALOG)
  for (let i = 0; productRows.length < N_PRODUCTS && i < N_PRODUCTS * 6; i++) {
    const cat = categories[i % categories.length]!
    const spec = CATALOG[cat]!
    const sku = `${spec.prefix}-${int(1000, 9999)}${int(10, 99)}`
    if (usedSku.has(sku)) continue
    usedSku.add(sku)

    const minStock = int(20, 200)
    // Deliberate spread: ~6% out of stock, ~14% at/below minimum, rest healthy.
    const r = rnd()
    const stock = r < 0.06 ? 0 : r < 0.2 ? int(0, minStock) : int(minStock + 1, minStock * 8)

    productRows.push({
      sku,
      name: `${pick(spec.items)} ${pick(SIZES)}`,
      category: cat,
      unitPrice: d2(int(spec.lo, spec.hi) + rnd()),
      stockQuantity: stock,
      minStock,
      warehouseLocation: pick(WAREHOUSES),
    })
  }
  await chunked(productRows, (c) => prisma.product.createMany({ data: c, skipDuplicates: true }), 'products')

  // ── challans + items + stock ledger ───────────────────────────────────────
  const customers = await prisma.customer.findMany({ select: { id: true } })
  const products = await prisma.product.findMany({
    select: { id: true, unitPrice: true, stockQuantity: true, minStock: true },
  })

  // Reserve a contiguous block of challan numbers, then leave the sequence
  // past the end so the running app never collides with seeded rows.
  const startSeq = Number(
    (await prisma.$queryRawUnsafe<{ v: string }[]>(
      `SELECT setval('${CHALLAN_SEQUENCE}', (SELECT last_value + 1 FROM ${CHALLAN_SEQUENCE}), false)::text AS v`,
    ))[0]!.v,
  )

  const challanRows: Prisma.ChallanCreateManyInput[] = []
  const itemRows: Prisma.ChallanItemCreateManyInput[] = []
  const logRows: Prisma.StockLogCreateManyInput[] = []
  /** Net movement per product, so final stock can be reconciled to the ledger. */
  const netByProduct = new Map<string, number>()

  const now = Date.now()
  const SPAN_DAYS = 540 // 18 months of history

  for (let i = 0; i < N_CHALLANS; i++) {
    const challanId = crypto.randomUUID()
    const seq = startSeq + i
    // Order volume rises toward the present — looks like a growing business.
    const skew = Math.pow(rnd(), 0.65)
    const daysAgo = Math.floor(SPAN_DAYS * (1 - skew))
    const createdAt = new Date(now - daysAgo * 86_400_000 - int(0, 86_399) * 1000)
    const year = createdAt.getFullYear()

    const r = rnd()
    const status: ChallanStatus = r < 0.72 ? 'CONFIRMED' : r < 0.9 ? 'DRAFT' : 'CANCELLED'

    // Unique products per challan — ChallanItem has @@unique([challanId, productId]).
    const nItems = int(1, 8)
    const chosen = new Set<number>()
    while (chosen.size < Math.min(nItems, products.length)) chosen.add(int(0, products.length - 1))

    let subtotal = new Prisma.Decimal(0)
    for (const idx of chosen) {
      const p = products[idx]!
      const qty = int(1, 60)
      const unit = new Prisma.Decimal(p.unitPrice)
      const line = unit.mul(qty)
      subtotal = subtotal.add(line)
      itemRows.push({
        challanId,
        productId: p.id,
        productNameSnapshot: '',
        skuSnapshot: '',
        unitPriceSnapshot: unit,
        quantity: qty,
        lineTotal: line,
      })
      if (status === 'CONFIRMED') {
        netByProduct.set(p.id, (netByProduct.get(p.id) ?? 0) - qty)
        logRows.push({
          productId: p.id,
          quantityChange: -qty,
          movementType: 'CHALLAN_OUT' as MovementType,
          reason: `Challan #${CHALLAN_PREFIX}-${year}-${String(seq).padStart(5, '0')}`,
          userId: pick(actorIds),
          createdAt,
        })
      }
    }

    const tax = subtotal.mul(GST_RATE)
    challanRows.push({
      id: challanId,
      challanNumber: `${CHALLAN_PREFIX}-${year}-${String(seq).padStart(5, '0')}`,
      customerId: pick(customers).id,
      subtotal,
      taxAmount: tax,
      totalAmount: subtotal.add(tax),
      status,
      createdById: pick(creatorIds),
      confirmedAt: status === 'CONFIRMED' ? createdAt : null,
      createdAt,
      updatedAt: createdAt,
    })
  }

  // Backfill the snapshot columns now that we know each product's identity.
  const productMeta = new Map(
    (await prisma.product.findMany({ select: { id: true, sku: true, name: true } })).map((p) => [p.id, p]),
  )
  for (const it of itemRows) {
    const meta = productMeta.get(it.productId)!
    it.productNameSnapshot = meta.name
    it.skuSnapshot = meta.sku
  }

  // Restocking history — also guarantees the CHECK (stock_quantity >= 0) holds
  // once the ledger is applied to current stock.
  for (const p of products) {
    const consumed = -(netByProduct.get(p.id) ?? 0)
    if (consumed <= 0) continue
    let remaining = consumed + int(0, p.minStock * 2)
    while (remaining > 0) {
      const qty = Math.min(remaining, int(50, 600))
      remaining -= qty
      netByProduct.set(p.id, (netByProduct.get(p.id) ?? 0) + qty)
      logRows.push({
        productId: p.id,
        quantityChange: qty,
        movementType: 'PURCHASE_IN' as MovementType,
        reason: pick(['Supplier restock — PO', 'Quarterly replenishment', 'Bulk purchase inward', 'Vendor delivery received']),
        userId: pick(actorIds),
        createdAt: new Date(now - int(1, SPAN_DAYS) * 86_400_000),
      })
    }
  }
  // A few manual corrections for movement-type variety.
  for (let i = 0; i < Math.max(20, Math.floor(N_CHALLANS * 0.02)); i++) {
    const p = pick(products)
    const delta = int(1, 25) * (rnd() < 0.5 ? -1 : 1)
    if ((netByProduct.get(p.id) ?? 0) + delta < -p.stockQuantity) continue
    netByProduct.set(p.id, (netByProduct.get(p.id) ?? 0) + delta)
    logRows.push({
      productId: p.id,
      quantityChange: delta,
      movementType: 'MANUAL_ADJUST' as MovementType,
      reason: pick(['Cycle count correction', 'Damaged goods write-off', 'Found in transit', 'Audit adjustment']),
      userId: pick(actorIds),
      createdAt: new Date(now - int(1, SPAN_DAYS) * 86_400_000),
    })
  }

  await chunked(challanRows, (c) => prisma.challan.createMany({ data: c, skipDuplicates: true }), 'challans')
  await chunked(itemRows, (c) => prisma.challanItem.createMany({ data: c, skipDuplicates: true }), 'challan items')
  await chunked(logRows, (c) => prisma.stockLog.createMany({ data: c, skipDuplicates: true }), 'stock logs')

  // Leave the sequence beyond every number we just wrote.
  await prisma.$executeRawUnsafe(`SELECT setval('${CHALLAN_SEQUENCE}', ${startSeq + N_CHALLANS})`)

  // Reconcile current stock with the ledger, clamped at 0 for the CHECK.
  // Done as one bulk UPDATE ... FROM (VALUES ...) rather than a query per
  // product — on a remote instance that is the difference between a few
  // hundred round-trips and one.
  console.log('   reconciling stock levels with the ledger…')
  const adjusted = products
    .map((p) => ({ id: p.id, qty: Math.max(0, p.stockQuantity + (netByProduct.get(p.id) ?? 0)) }))
    .filter((p) => netByProduct.has(p.id))
  for (let i = 0; i < adjusted.length; i += BATCH) {
    const slice = adjusted.slice(i, i + BATCH)
    const values = slice.map((p) => `('${p.id}'::uuid, ${p.qty})`).join(',')
    await prisma.$executeRawUnsafe(
      `UPDATE products SET stock_quantity = v.qty
         FROM (VALUES ${values}) AS v(id, qty)
        WHERE products.id = v.id`,
    )
  }

  // ── payments ──────────────────────────────────────────────────────────────
  // Receipts only make sense against confirmed challans. The spread is chosen so
  // the aging report is actually interesting: most recent invoices settled, a
  // long tail part-paid or untouched, so every bucket has something in it.
  console.log('   generating payment history…')
  const confirmed = await prisma.challan.findMany({
    where: { status: 'CONFIRMED' },
    select: { id: true, customerId: true, totalAmount: true, confirmedAt: true },
  })

  const paymentRows: Prisma.PaymentCreateManyInput[] = []
  const METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'ADJUSTMENT']

  for (const ch of confirmed) {
    if (!ch.confirmedAt) continue
    const ageDays = Math.floor((now - ch.confirmedAt.getTime()) / 86_400_000)
    const total = new Prisma.Decimal(ch.totalAmount)

    // Older invoices are likelier to be settled; recent ones often still open.
    const settleChance = ageDays > 120 ? 0.9 : ageDays > 60 ? 0.7 : ageDays > 30 ? 0.5 : 0.25
    const r = rnd()
    if (r > settleChance + 0.18) continue // wholly unpaid

    const partial = r > settleChance // paid something, but not all
    const instalments = partial ? 1 : int(1, 3)
    // Leave 15–65% outstanding on partials.
    const target = partial ? total.mul(new Prisma.Decimal(1 - (0.15 + rnd() * 0.5))) : total

    let booked = new Prisma.Decimal(0)
    for (let k = 0; k < instalments; k++) {
      const last = k === instalments - 1
      const slice = last ? target.minus(booked) : target.div(instalments).mul(new Prisma.Decimal(0.9 + rnd() * 0.2))
      const amount = new Prisma.Decimal(slice.toFixed(2))
      if (amount.lte(0)) break
      // Never exceed the invoice: the app enforces this transactionally, and
      // seeded data must satisfy the same invariant or the ledger lies.
      if (booked.plus(amount).gt(total)) break
      booked = booked.plus(amount)

      const offset = Math.min(ageDays, int(2, Math.max(3, Math.floor(ageDays * 0.8))) + k * int(5, 25))
      paymentRows.push({
        challanId: ch.id,
        customerId: ch.customerId,
        amount,
        method: pick(METHODS),
        reference: `${pick(['UTR', 'CHQ', 'UPI', 'REF'])}${int(100000, 999999)}`,
        paidAt: new Date(ch.confirmedAt.getTime() + offset * 86_400_000),
        createdById: pick(creatorIds),
      })
    }
  }
  await chunked(paymentRows, (c) => prisma.payment.createMany({ data: c, skipDuplicates: true }), 'payments')

  // Bulk-inserted tables have no planner statistics and an unset visibility
  // map, which blocks index-only scans — measured ~2x slower API responses
  // until this runs. Cheap, and autovacuum would otherwise take a while.
  console.log('   analyzing tables for the query planner…')
  for (const t of ['challans', 'challan_items', 'stock_logs', 'products', 'customers', 'payments']) {
    await prisma.$executeRawUnsafe(`VACUUM ANALYZE ${t}`)
  }

  const [c, pr, ch, ci, sl, pay] = await Promise.all([
    prisma.customer.count(), prisma.product.count(), prisma.challan.count(),
    prisma.challanItem.count(), prisma.stockLog.count(), prisma.payment.count(),
  ])
  const size = await prisma.$queryRawUnsafe<{ db: string }[]>(
    'SELECT pg_size_pretty(pg_database_size(current_database())) AS db',
  )
  console.log(
    `\n✅ Demo data ready in ${((Date.now() - t0) / 1000).toFixed(1)}s\n` +
      `   customers ${c} · products ${pr} · challans ${ch} · items ${ci} · stock logs ${sl} · payments ${pay}\n` +
      `   total rows ${c + pr + ch + ci + sl + pay} · database size ${size[0]!.db}\n`,
  )
}

main()
  .catch((e) => {
    console.error('❌ Demo seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
