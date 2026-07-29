import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../utils/password'

const prisma = new PrismaClient()

/** Demo password for ALL seeded accounts (change in any real deployment). */
const DEMO_PASSWORD = 'Password@123'

const USERS = [
  { email: 'admin@fundsroom.in', name: 'Aarav Mehta', role: 'ADMIN' as const },
  { email: 'sales@fundsroom.in', name: 'Priya Nair', role: 'SALES' as const },
  { email: 'warehouse@fundsroom.in', name: 'Rohan Das', role: 'WAREHOUSE' as const },
  { email: 'accounts@fundsroom.in', name: 'Neha Kapoor', role: 'ACCOUNTS' as const },
]

const CUSTOMERS = [
  {
    businessName: 'Acme Traders',
    contactPerson: 'Rahul Sharma',
    mobile: '9876543210',
    email: 'rahul@acmetraders.in',
    gstin: '27ABCDE1234F1Z5',
    type: 'WHOLESALE' as const,
    status: 'ACTIVE' as const,
    addressLine1: '14 MG Road',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
  },
  {
    businessName: 'Metro Distributors',
    contactPerson: 'Sana Khan',
    mobile: '9700456123',
    email: 'sana@metrodist.co.in',
    gstin: '07METRO1122M1Z1',
    type: 'WHOLESALE' as const,
    status: 'ACTIVE' as const,
    addressLine1: '3 Karol Bagh',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110005',
  },
  {
    businessName: 'Sunrise Retail Mart',
    contactPerson: 'Vikram Patel',
    mobile: '9911223344',
    email: 'vikram@sunrisemart.in',
    gstin: '24SUNRS7890L1Z9',
    type: 'RETAIL' as const,
    status: 'LEAD' as const,
    addressLine1: 'Shop 7, CG Road',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380009',
  },
]

const PRODUCTS = [
  { sku: 'ELEC-1001', name: 'USB-C Fast Charger 30W', category: 'Electronics', unitPrice: 649, stockQuantity: 420, minStock: 100, warehouseLocation: 'Mumbai Hub' },
  { sku: 'ELEC-1002', name: 'Wireless Optical Mouse', category: 'Electronics', unitPrice: 399, stockQuantity: 58, minStock: 80, warehouseLocation: 'Bengaluru DC' },
  { sku: 'GROC-2002', name: 'Refined Sunflower Oil 15L', category: 'Groceries', unitPrice: 1620, stockQuantity: 210, minStock: 60, warehouseLocation: 'Delhi DC' },
  { sku: 'HARD-4002', name: 'Stainless Steel Screw Set (500 pc)', category: 'Hardware', unitPrice: 599, stockQuantity: 640, minStock: 150, warehouseLocation: 'Mumbai Hub' },
  { sku: 'STAT-5001', name: 'A4 Copier Paper 80gsm (Ream)', category: 'Stationery', unitPrice: 289, stockQuantity: 0, minStock: 120, warehouseLocation: 'Bengaluru DC' },
  { sku: 'BEVG-6001', name: 'Instant Coffee 500g Jar', category: 'Beverages', unitPrice: 720, stockQuantity: 305, minStock: 90, warehouseLocation: 'Delhi DC' },
]

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { ...u, passwordHash },
    })
  }

  for (const c of CUSTOMERS) {
    // Customers have no natural unique key here; only create if absent.
    const existing = await prisma.customer.findFirst({ where: { businessName: c.businessName } })
    if (!existing) await prisma.customer.create({ data: c })
  }

  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: { name: p.name, unitPrice: p.unitPrice, minStock: p.minStock },
      create: p,
    })
  }

  // eslint-disable-next-line no-console
  console.log(
    `✅ Seed complete — ${USERS.length} users, ${CUSTOMERS.length} customers, ${PRODUCTS.length} products.\n` +
      `   Login with any of: ${USERS.map((u) => u.email).join(', ')}\n` +
      `   Password for all: ${DEMO_PASSWORD}`,
  )
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
