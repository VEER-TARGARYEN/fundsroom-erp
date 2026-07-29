# Fundsroom ERP — Backend API

Production-grade **Node.js + Express 5 + TypeScript + PostgreSQL + Prisma** backend
for the Fundsroom wholesale ERP/CRM. Features JWT auth with RBAC, Zod validation,
Swagger docs, and — the centerpiece — a **concurrency-safe, ACID sales-challan
confirmation** that can never oversell stock.

## Tech & version notes

| Concern | Choice |
|---|---|
| Runtime / framework | Node 22, Express 5 |
| ORM / DB | Prisma 6 (CommonJS), PostgreSQL 17 |
| Auth | `jsonwebtoken` (HS256, pinned `algorithms` allowlist), argon2id hashing |
| Validation | Zod 4 (middleware for body/query/params) |
| Docs | swagger-ui-express + swagger-jsdoc at `/api/docs` |
| Security | helmet, cors (allowlist), express-rate-limit, structured pino logs |

> **Why Prisma 6, not 7?** Prisma 7 is the latest major but mandates ESM + driver
> adapters + a generated-client path — friction for a drop-in build. The
> transaction-safety approach here is version-independent; upgrading to 7 is a
> config change (add `@prisma/adapter-pg`, set the `prisma-client` generator).

## The concurrency-safe `confirmChallan` (see `src/services/challan.service.ts`)

Everything runs in one interactive `prisma.$transaction` (ReadCommitted):

1. **Lock the challan row** `FOR UPDATE` → two concurrent confirms of the *same*
   challan serialize; the loser sees `CONFIRMED` and is rejected (no double deduct).
2. **Lock every product row** in one `... WHERE id IN (…) ORDER BY id FOR UPDATE`
   statement → ordering by PK gives a globally consistent lock order, so
   concurrent confirms sharing products **cannot deadlock**.
3. **Validate all lines** against locked stock; if any fall short, throw a `400`
   listing **every** shortfall → the whole transaction rolls back (no partial writes).
4. **Deduct stock**, write one `CHALLAN_OUT` StockLog per line, flip to `CONFIRMED`.

Plus a **DB-level `CHECK (stock_quantity >= 0)`** (applied at startup in
`src/db/constraints.ts`) so zero-negative-stock is guaranteed by the database itself.

## RBAC matrix

| Resource | ADMIN | SALES | WAREHOUSE | ACCOUNTS |
|---|:-:|:-:|:-:|:-:|
| Customers (read) | ✅ | ✅ | — | ✅ |
| Customers (write) | ✅ | ✅ | — | — |
| Products (read) | ✅ | ✅ | ✅ | — |
| Products (write) | ✅ | — | ✅ | — |
| **Manual stock adjust** | ✅ | — | ✅ | — |
| Stock logs | ✅ | — | ✅ | — |
| Challans (all) | ✅ | ✅ | — | ✅ |

WAREHOUSE never sees challan financial totals; SALES can only move stock by
confirming a challan (not via manual adjust).

## Run it — Option A: Docker (one command, from the repo root)

```bash
cp .env.example .env      # then edit the secrets
docker compose up --build
```

- Frontend → http://localhost:8080
- API + Swagger → http://localhost:4000/api/docs
- Postgres → localhost:5432

The API container waits for Postgres to be healthy, applies the schema
(`prisma db push`), and seeds demo data automatically.

## Run it — Option B: backend only, locally

```bash
# 1) Start just Postgres (from repo root)
docker compose up -d db

# 2) In server/
cd server
cp .env.example .env       # DATABASE_URL already points at localhost:5432
npm install
npm run prisma:generate
npm run prisma:migrate     # creates tables (prisma migrate dev)
npm run db:seed            # seed users + demo data
npm run dev                # http://localhost:4000/api/docs
```

## Seeded login credentials

Password for **all** accounts: `Password@123`

| Email | Role |
|---|---|
| admin@fundsroom.in | ADMIN |
| sales@fundsroom.in | SALES |
| warehouse@fundsroom.in | WAREHOUSE |
| accounts@fundsroom.in | ACCOUNTS |

## Quick API tour

```bash
# 1) Log in → copy the accessToken
curl -s http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@fundsroom.in","password":"Password@123"}'

# 2) Use it
curl http://localhost:4000/api/products -H "Authorization: Bearer <TOKEN>"
```

Or just open **/api/docs**, click **Authorize**, and try endpoints interactively.

## Project structure

```
server/
  prisma/schema.prisma        Models, enums, indexes (snake_case, Decimal money)
  src/
    config/     env (zod-validated), prisma client, pino logger
    constants/  business rules (GST rate, challan sequence)
    db/         constraints.ts (CHECK + sequence, applied at startup)
    middleware/ auth (JWT + checkRole), validate (zod), error, rateLimit
    schemas/    zod request schemas per resource
    controllers/ thin HTTP handlers
    services/   challan.service (ACID transaction), stock.service
    routes/     RBAC-guarded routers with @openapi annotations
    utils/      AppError, jwt, password (argon2), asyncHandler
    swagger.ts  OpenAPI definition
    app.ts / server.ts
```

## Known limitations

- Refresh tokens are stateless JWTs in an HttpOnly cookie; rotation + reuse
  detection (a server-side jti store) is the next hardening step.
- Docker first-boot uses `prisma db push` (no migration history committed). For
  real deployments generate migrations with `prisma migrate dev` and the
  entrypoint will `migrate deploy` them automatically.
