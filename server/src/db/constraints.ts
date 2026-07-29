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

  logger.info('Database constraints & sequences ensured')
}
