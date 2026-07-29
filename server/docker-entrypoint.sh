#!/bin/sh
set -e

echo "→ Applying database schema..."
# Prefer committed migrations if present; otherwise push the schema directly
# (fine for demo/first-boot when no migration history has been generated yet).
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy
else
  npx prisma db push --skip-generate
fi

if [ "${RUN_SEED}" = "true" ]; then
  echo "→ Seeding database (idempotent)..."
  node dist/scripts/seed.js || echo "  seed skipped/failed (non-fatal)"
fi

echo "→ Starting API..."
exec "$@"
