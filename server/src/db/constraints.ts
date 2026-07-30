import { prisma } from '../config/prisma'
import { CHALLAN_SEQUENCE, PO_SEQUENCE, GRN_SEQUENCE } from '../constants/business'
import { logger } from '../config/logger'

/**
 * Idempotent database hardening applied once at startup (after migrations):
 *
 *  1. A CHECK constraint guaranteeing `stock_quantity >= 0` at the DATABASE
 *     level. Even if application logic is ever bypassed or buggy, Postgres
 *     rejects any write that would drive stock negative — zero-negative-stock
 *     becomes a schema invariant, not just a code convention.
 *
 *  2. A sequence backing atomic, collision-free challan numbering under
 *     concurrency (nextval is atomic; two concurrent creates can never collide).
 *
 * Prisma 6 cannot express CHECK constraints or sequences declaratively, so we
 * apply them here with guarded DDL. Safe to run repeatedly.
 */
export async function ensureDatabaseConstraints(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_nonneg'
      ) THEN
        ALTER TABLE "products"
          ADD CONSTRAINT products_stock_nonneg CHECK ("stock_quantity" >= 0);
      END IF;
    END $$;
  `)

  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS "${CHALLAN_SEQUENCE}" START WITH 1 INCREMENT BY 1;`,
  )

  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS "${PO_SEQUENCE}" START WITH 1 INCREMENT BY 1;`,
  )
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS "${GRN_SEQUENCE}" START WITH 1 INCREMENT BY 1;`,
  )

  await ensureNotificationsTable()
  await ensureGoogleAccountsTable()
  await ensurePaymentsTable()
  await ensurePurchasingTables()

  logger.info('Database constraints & sequences ensured')
}

/**
 * Purchasing: suppliers, purchase orders, and goods receipts. Idempotent.
 *
 * Two CHECK constraints encode invariants the application also enforces, so a
 * bug or a direct SQL edit still cannot corrupt the ledger:
 *
 *   • `ordered_quantity > 0` and `received_quantity >= 0` — a zero-quantity
 *     order line is meaningless, and a negative receipt would silently reduce
 *     stock through a path that claims to be an inflow.
 *   • `received_quantity <= ordered_quantity` — the over-receipt invariant.
 *     Unlike the payments equivalent this one CAN be a CHECK, because the
 *     running total is denormalised onto the same row. That makes it a true
 *     backstop: even if the service logic were bypassed, Postgres rejects the
 *     write. The transactional guard in purchaseOrder.service.ts still exists
 *     to produce a good error message rather than a raw constraint violation.
 */
async function ensurePurchasingTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseOrderStatus') THEN
        CREATE TYPE "PurchaseOrderStatus" AS ENUM
          ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
      END IF;
    END $$;
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "suppliers" (
      "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "name"               TEXT NOT NULL,
      "contact_person"     TEXT NOT NULL,
      "mobile"             TEXT NOT NULL,
      "email"              TEXT,
      "gstin"              VARCHAR(15),
      "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
      "is_active"          BOOLEAN NOT NULL DEFAULT true,
      "notes"              TEXT,
      "address_line1"      TEXT,
      "city"               TEXT,
      "state"              TEXT,
      "pincode"            VARCHAR(10),
      "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT suppliers_terms_nonneg CHECK ("payment_terms_days" >= 0)
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "purchase_orders" (
      "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "po_number"     TEXT NOT NULL UNIQUE,
      "supplier_id"   UUID NOT NULL REFERENCES "suppliers"("id") ON DELETE RESTRICT,
      "status"        "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
      "subtotal"      DECIMAL(14,2) NOT NULL DEFAULT 0,
      "tax_amount"    DECIMAL(14,2) NOT NULL DEFAULT 0,
      "total_amount"  DECIMAL(14,2) NOT NULL DEFAULT 0,
      "expected_date" DATE,
      "notes"         TEXT,
      "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "sent_at"       TIMESTAMP(3),
      "closed_at"     TIMESTAMP(3),
      "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "purchase_order_items" (
      "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "purchase_order_id"     UUID NOT NULL REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
      "product_id"            UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
      "product_name_snapshot" TEXT NOT NULL,
      "sku_snapshot"          TEXT NOT NULL,
      "unit_cost"             DECIMAL(12,2) NOT NULL,
      "ordered_quantity"      INTEGER NOT NULL,
      "received_quantity"     INTEGER NOT NULL DEFAULT 0,
      "line_total"            DECIMAL(14,2) NOT NULL,
      CONSTRAINT po_items_ordered_positive  CHECK ("ordered_quantity" > 0),
      CONSTRAINT po_items_received_nonneg   CHECK ("received_quantity" >= 0),
      CONSTRAINT po_items_no_over_receipt   CHECK ("received_quantity" <= "ordered_quantity")
    );
  `)
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "purchase_order_items_po_product_key"
       ON "purchase_order_items" ("purchase_order_id", "product_id");`,
  )

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "goods_receipts" (
      "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "receipt_number"    TEXT NOT NULL UNIQUE,
      "purchase_order_id" UUID NOT NULL REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
      "supplier_ref"      TEXT,
      "notes"             TEXT,
      "received_at"       TIMESTAMP(3) NOT NULL,
      "received_by_id"    UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "goods_receipt_items" (
      "id"                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "goods_receipt_id"       UUID NOT NULL REFERENCES "goods_receipts"("id") ON DELETE CASCADE,
      "purchase_order_item_id" UUID NOT NULL REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT,
      "product_id"             UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
      "quantity_received"      INTEGER NOT NULL,
      CONSTRAINT grn_items_qty_positive CHECK ("quantity_received" > 0)
    );
  `)

  const indexes: [string, string, string][] = [
    ['suppliers_name_idx', 'suppliers', 'name'],
    ['suppliers_is_active_idx', 'suppliers', 'is_active'],
    ['purchase_orders_supplier_id_idx', 'purchase_orders', 'supplier_id'],
    ['purchase_orders_status_idx', 'purchase_orders', 'status'],
    ['purchase_orders_created_by_id_idx', 'purchase_orders', 'created_by_id'],
    ['purchase_orders_created_at_idx', 'purchase_orders', 'created_at'],
    ['purchase_orders_expected_date_idx', 'purchase_orders', 'expected_date'],
    ['purchase_order_items_purchase_order_id_idx', 'purchase_order_items', 'purchase_order_id'],
    ['purchase_order_items_product_id_idx', 'purchase_order_items', 'product_id'],
    ['goods_receipts_purchase_order_id_idx', 'goods_receipts', 'purchase_order_id'],
    ['goods_receipts_received_at_idx', 'goods_receipts', 'received_at'],
    ['goods_receipt_items_goods_receipt_id_idx', 'goods_receipt_items', 'goods_receipt_id'],
    ['goods_receipt_items_purchase_order_item_id_idx', 'goods_receipt_items', 'purchase_order_item_id'],
    ['goods_receipt_items_product_id_idx', 'goods_receipt_items', 'product_id'],
  ]
  for (const [name, tbl, col] of indexes) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "${name}" ON "${tbl}" ("${col}");`,
    )
  }
}

/**
 * Receipts against confirmed challans. Idempotent.
 *
 * `amount > 0` is a CHECK rather than only a Zod rule: a negative receipt would
 * silently inflate what a customer still owes, and refunds are modelled as their
 * own ADJUSTMENT rows instead. The "payments never exceed the challan total"
 * invariant can't be expressed as a CHECK (it spans rows), so it's enforced
 * transactionally in payment.service.ts.
 */
async function ensurePaymentsTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethod') THEN
        CREATE TYPE "PaymentMethod" AS ENUM
          ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'ADJUSTMENT');
      END IF;
    END $$;
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "payments" (
      "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "challan_id"    UUID NOT NULL REFERENCES "challans"("id") ON DELETE CASCADE,
      "customer_id"   UUID NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
      "amount"        DECIMAL(14,2) NOT NULL,
      "method"        "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
      "reference"     TEXT,
      "note"          TEXT,
      "paid_at"       TIMESTAMP(3) NOT NULL,
      "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT payments_amount_positive CHECK ("amount" > 0)
    );
  `)

  for (const col of ['challan_id', 'customer_id', 'paid_at']) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "payments_${col}_idx" ON "payments" ("${col}");`,
    )
  }
}

/** Linked Google identities + encrypted Workspace tokens. Idempotent. */
async function ensureGoogleAccountsTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "google_accounts" (
      "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id"       UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
      "google_sub"    TEXT NOT NULL UNIQUE,
      "email"         TEXT NOT NULL,
      "name"          TEXT,
      "picture"       TEXT,
      "access_token"  TEXT,
      "refresh_token" TEXT,
      "expires_at"    TIMESTAMP(3),
      "scope"         TEXT,
      "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

/**
 * Notification storage for the alert agent.
 *
 * Created with explicit DDL rather than `prisma db push` because this database
 * is shared with another application: push reconciles the whole database
 * against this schema and would propose dropping the tables it doesn't know
 * about. Naming every object here keeps the blast radius to exactly these.
 * Idempotent, so it is safe on every boot.
 */
async function ensureNotificationsTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
        CREATE TYPE "NotificationType" AS ENUM
          ('OUT_OF_STOCK', 'LOW_STOCK', 'DRAFT_STALE', 'FOLLOW_UP_DUE');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationSeverity') THEN
        CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
      END IF;
    END $$;
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "notifications" (
      "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "type"       "NotificationType" NOT NULL,
      "severity"   "NotificationSeverity" NOT NULL DEFAULT 'INFO',
      "title"      TEXT NOT NULL,
      "body"       TEXT NOT NULL,
      "entity_id"  UUID,
      "entity_ref" TEXT,
      "href"       TEXT,
      "read_at"    TIMESTAMP(3),
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // One open alert per (condition, entity) — this is what makes re-running the
  // agent idempotent instead of duplicating rows and resetting read state.
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "notifications_type_entity_id_key"
       ON "notifications" ("type", "entity_id");`,
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "notifications_read_at_idx" ON "notifications" ("read_at");`,
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" ("created_at");`,
  )
}
