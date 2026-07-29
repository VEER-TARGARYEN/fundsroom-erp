# Fundsroom ERP — Nexus Core

Production-grade Mini ERP + CRM Operations Portal for a B2B wholesale company.

**Stack:** React 18 · Vite 5 · TypeScript (strict) · Tailwind v3 (Aetheric Enterprise design system) · TanStack Query v5 · Axios · Express 5 · Prisma 6 · PostgreSQL · JWT (HttpOnly cookie refresh)

---

## Live Deployment

| Service | URL |
|---------|-----|
| Frontend | *(fill in after Vercel deploy)* |
| Backend API | *(fill in after Render deploy)* |
| Swagger UI | `<RENDER_API_URL>/api/docs` |

---

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@fundsroom.in | Password@123 |
| Sales | sales@fundsroom.in | Password@123 |
| Warehouse | warehouse@fundsroom.in | Password@123 |
| Accounts | accounts@fundsroom.in | Password@123 |

---

## RBAC Matrix

| Module | ADMIN | SALES | WAREHOUSE | ACCOUNTS |
|--------|:-----:|:-----:|:---------:|:--------:|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Customers (CRM) | ✅ | ✅ | — | ✅ |
| Products | ✅ | ✅ | ✅ | — |
| Inventory / Stock Logs | ✅ | — | ✅ | — |
| Sales Challans | ✅ | ✅ | — | ✅ |
| AI / Reports / Settings | stub | stub | stub | stub |

---

## Deploy — Step by Step

### 1 · Neon (PostgreSQL)

1. Go to [neon.tech](https://neon.tech) → **Create a project** → choose **AWS / Singapore** (matches Render region).
2. After creation, copy the **connection string** from *Dashboard → Connection Details*. It looks like:
   ```
   postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
3. Open `server/.env` and replace `DATABASE_URL`:
   ```env
   DATABASE_URL="postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
   ```
4. Push the schema and seed the database:
   ```bash
   cd server
   npx prisma db push
   npm run db:seed
   ```
   Expected seed output:
   ```
   ✅ Users seeded   (admin / sales / warehouse / accounts)
   ✅ Customers seeded
   ✅ Products seeded
   ✅ Seed complete
   ```

---

### 2 · Render (Backend API)

#### Option A — render.yaml (recommended)

The repo ships a `render.yaml` at the project root. Render will pick it up automatically.

1. Push the repo to GitHub (or fork it).
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → connect your repo.
3. Render detects `render.yaml` and creates a **Web Service** called `fundsroom-erp-api`.
4. Before deploying, set the two manual env vars that `render.yaml` marks `sync: false`:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Your Neon connection string (with `?sslmode=require`) |
   | `CORS_ORIGIN` | Your Vercel frontend URL, e.g. `https://fundsroom-erp.vercel.app` |

5. Click **Apply** / **Deploy**. First deploy takes ~3 min (installs, `prisma generate`, TypeScript build).
6. Once live, visit `https://<your-render-slug>.onrender.com/health` — should return `{"status":"ok"}`.

#### Option B — Manual (if Blueprint is unavailable)

1. **New → Web Service** → connect repo → set **Root Directory** to `server`.
2. **Runtime:** Node · **Region:** Singapore
3. **Build command:**
   ```
   npm ci && npx prisma generate && npm run build
   ```
4. **Start command:**
   ```
   node dist/server.js
   ```
5. Add all env vars from `server/.env.example`:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `4000` |
   | `DATABASE_URL` | Neon connection string |
   | `JWT_ACCESS_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
   | `JWT_REFRESH_SECRET` | Generate another random string (different from above) |
   | `ACCESS_TOKEN_TTL` | `15m` |
   | `REFRESH_TOKEN_TTL` | `7d` |
   | `JWT_ISSUER` | `fundsroom-erp` |
   | `JWT_AUDIENCE` | `fundsroom-web` |
   | `CORS_ORIGIN` | `https://fundsroom-erp.vercel.app` |
   | `RATE_LIMIT_WINDOW_MS` | `900000` |
   | `RATE_LIMIT_MAX` | `300` |
   | `RUN_SEED` | `true` |

6. **Health check path:** `/health`

---

### 3 · Vercel (Frontend)

1. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import your GitHub repo.
2. **Framework preset:** Vite
3. **Root directory:** *(leave blank — `vercel.json` is at the repo root and `index.html` / `vite.config.ts` are too)*
4. **Build command:** `npm run build` (default, uses `tsc -b && vite build`)
5. **Output directory:** `dist`
6. Add one **Environment Variable**:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://<your-render-slug>.onrender.com` |

7. Click **Deploy**. Vercel runs the Vite build and publishes to a global CDN.
8. The `vercel.json` in the repo handles SPA routing (all non-asset paths rewrite to `/index.html`) and sets `Cache-Control: immutable` on hashed JS/CSS assets.
9. Copy the Vercel URL (e.g. `https://fundsroom-erp.vercel.app`) and go back to your Render service → **Environment → CORS_ORIGIN** → paste it → **Save** → Render redeploys.

---

### 4 · Verify end-to-end

```bash
# 1. Health
curl https://<render-slug>.onrender.com/health

# 2. Login
curl -s -X POST https://<render-slug>.onrender.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@fundsroom.in","password":"Password@123"}' | jq .

# 3. Swagger UI
open https://<render-slug>.onrender.com/api/docs

# 4. Frontend
open https://fundsroom-erp.vercel.app
```

---

## Docker Compose (local / self-hosted fallback)

Runs the full stack (Postgres 17, Express API, nginx-served React) with a single command.

```bash
# Prerequisites: Docker Desktop (Mac/Windows) or Docker Engine + Compose v2 (Linux)
cp server/.env.example server/.env   # edit DATABASE_URL if needed; defaults work for compose
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend (nginx) | http://localhost:8080 |
| API | http://localhost:4000 |
| Swagger UI | http://localhost:4000/api/docs |
| Postgres | localhost:5432 |

The `api` service runs `prisma db push` + seed on first boot (`RUN_SEED=true`).

To reset the database:
```bash
docker compose down -v   # removes the postgres volume
docker compose up --build
```

---

## Local Development

### Backend

```bash
cd server
cp .env.example .env          # set DATABASE_URL to a local/Neon Postgres
npm install
npx prisma db push
npm run db:seed
npm run dev                   # tsx watch → http://localhost:4000
```

### Frontend

```bash
# in project root (fundsroom-erp/)
npm install
# create .env.local:
echo 'VITE_API_URL=http://localhost:4000' > .env.local
npm run dev                   # Vite HMR → http://localhost:5173
```

---

## Project Architecture

```
fundsroom-erp/
├── src/
│   ├── api/               Axios client (in-memory token, single-flight refresh) + resource hooks
│   ├── features/
│   │   ├── auth/          AuthContext, LoginPage, RequireAuth
│   │   ├── dashboard/     DashboardPage (KPI cards wired to live counts)
│   │   ├── customers/     CustomersPage, CustomerForm, CustomerDrawer
│   │   ├── products/      ProductsPage, ProductForm, AdjustStockDialog
│   │   ├── inventory/     InventoryPage (stock movement log)
│   │   └── challans/      ChallansPage, ChallanBuilder (ACID confirm flow)
│   ├── components/
│   │   ├── layout/        AppShell, Sidebar, Header, CommandPalette
│   │   ├── ui/            Aetheric Enterprise primitives
│   │   └── feedback/      ToastContext, ErrorBoundary
│   ├── lib/               queryClient, errors (mapApiError / fieldErrors / insufficientStockItems)
│   └── types/api.ts       All domain types (Role, Customer, Product, Challan …)
├── server/
│   ├── src/
│   │   ├── routes/        auth, customers, products, stockLogs, challans
│   │   ├── services/      challan.service (ACID confirmChallan with SELECT FOR UPDATE)
│   │   ├── middleware/     authenticate, requireRole, validate, errorHandler
│   │   ├── schemas/       Zod v4 request schemas
│   │   ├── db/            constraints.ts (CHECK stock_quantity >= 0, challan_number_seq)
│   │   └── config/        env (Zod-validated), prisma, logger, swagger
│   └── prisma/schema.prisma
├── docker-compose.yml
├── render.yaml
├── vercel.json
├── nginx.conf             SPA fallback + /api/ reverse proxy (Docker only)
└── Dockerfile             Multi-stage nginx build (Docker only)
```

### Key implementation notes

**Concurrency-safe stock deduction** (`server/src/services/challan.service.ts`)  
`confirmChallan` runs inside a single `$transaction(ReadCommitted)`:
1. `SELECT ... FOR UPDATE` on the challan row — prevents double-confirm.
2. `SELECT ... WHERE id IN (...) ORDER BY id FOR UPDATE` on all products — consistent lock order prevents deadlock.
3. Collects ALL shortfalls before throwing, so the caller gets a complete error list.
4. A `CHECK (stock_quantity >= 0)` DB constraint is the final backstop.

**XSS-safe auth**  
The JWT access token is kept in a module-level variable (`src/api/tokenStore.ts`), never in `localStorage`. The refresh token lives in an `HttpOnly` cookie. On page load `AuthContext` calls `/auth/refresh` to rehydrate the access token.

**Single-flight 401 retry** (`src/api/client.ts`)  
Multiple concurrent 401 responses share one `refreshPromise` so only one `/auth/refresh` round-trip is made, then all queued requests retry with the new token.

**Design system**  
Aetheric Enterprise: dark charcoal `#101417` surfaces, Electric Indigo `#c0c1ff` as the secondary/AI accent, Geist UI + JetBrains Mono fonts, Material Symbols Outlined icons.
