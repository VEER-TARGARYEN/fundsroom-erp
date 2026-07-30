import { prisma } from '../config/prisma'
import { CHALLAN_SEQUENCE } from '../constants/business'
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

  await ensureNotificationsTable()
  await ensureGoogleAccountsTable()
  await ensurePaymentsTable()

  logger.info('Database constraints & sequences ensured')
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
