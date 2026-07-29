# Fundsroom ERP — Nexus Core

> **Production-grade Mini ERP + CRM Operations Portal** for a B2B wholesale company.  
> Built with React 18, Vite 5, TypeScript (strict), Express 5, Prisma 6, PostgreSQL (Neon), JWT authentication, and a full RBAC permission system.

---

## 🔗 Live Links

| Service | URL |
|---------|-----|
| **Frontend (Vercel)** | https://fundsroom-erp-nine.vercel.app |
| **Backend API (Render)** | https://fundsroom-erp-api-gve9.onrender.com |
| **Swagger / API Docs** | https://fundsroom-erp-api-gve9.onrender.com/api/docs |
| **GitHub Repository** | https://github.com/VEER-TARGARYEN/fundsroom-erp |

---

## 🎓 Project Details

| Field | Value |
|-------|-------|
| **Name** | VEER TARGARYEN |
| **Branch** | Computer Science & Engineering |
| **Passing Year** | 2026 |
| **GitHub Repository** | https://github.com/VEER-TARGARYEN/fundsroom-erp |
| **Documentation** | https://fundsroom-erp-api-gve9.onrender.com/api/docs |

---

## 🧪 Demo Credentials

| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Admin** | admin@fundsroom.in | Password@123 | Full access to all modules |
| **Sales** | sales@fundsroom.in | Password@123 | Customers, Products, Challans, AI |
| **Warehouse** | warehouse@fundsroom.in | Password@123 | Products, Inventory, Notifications |
| **Accounts** | accounts@fundsroom.in | Password@123 | Customers, Challans, Reports |

---

## 📌 Features

### ✅ Core Modules (Fully Functional)
| Module | Description |
|--------|-------------|
| **Dashboard** | Live KPI cards — inventory value, low-stock count, pending challans, open leads. Auto-updates on every navigation. |
| **Customers (CRM)** | Full CRUD with business details, GSTIN, follow-up dates, status (Active / Lead / Inactive), type (Wholesale / Retail). |
| **Products** | SKU catalogue with category, pricing, warehouse location, and inline stock adjustment with reason audit trail. |
| **Inventory / Stock Logs** | Immutable ledger of every stock movement — PURCHASE_IN, CHALLAN_OUT, MANUAL_ADJUST — with who did it and when. |
| **Sales Challans** | ACID-safe order workflow. Draft → Confirm atomically deducts stock using `SELECT FOR UPDATE`; rejects with a full shortfall list if any SKU is insufficient. |
| **Reports & Analytics** | Live sales KPIs, inventory-by-category bar charts, top-product/customer breakdowns, challan status split, one-click CSV export. |
| **Notifications** | Smart operational inbox — low-stock alerts, draft-challan reminders, open-lead follow-ups, stock-movement activity. Unread tracking, mark-as-read, configurable streams. |
| **Settings** | Profile card, per-stream notification toggles (persisted across sessions), security info, sign-out. |
| **AI Assistant** | Nexus AI copilot grounded in live ERP data — answers inventory, CRM and sales questions in natural language (requires Groq API key). |

---

## 🏗️ Architecture

```
fundsroom-erp/
├── src/                         ← React 18 + Vite frontend
│   ├── api/                     Axios client — in-memory token, single-flight 401 retry
│   ├── features/
│   │   ├── auth/                Login, AuthContext, RequireAuth
│   │   ├── dashboard/           Live KPI dashboard
│   │   ├── customers/           CRM with drawer, form, status management
│   │   ├── products/            Product catalogue + stock adjustment dialog
│   │   ├── inventory/           Stock movement log
│   │   ├── challans/            Challan builder + ACID confirm flow
│   │   ├── reports/             Analytics + CSV export
│   │   ├── notifications/       Alert inbox with read-state
│   │   ├── ai/                  Nexus AI chat (grounded)
│   │   └── settings/            Profile + preferences
│   ├── components/
│   │   ├── layout/              AppShell, Sidebar, Header, CommandPalette
│   │   ├── ui/                  Aetheric Enterprise design system primitives
│   │   └── guards/              RequireAuth, RequireRole, NotFound
│   └── types/api.ts             Domain types (Role, Customer, Product, Challan…)
│
├── server/                      ← Node + Express 5 backend
│   └── src/
│       ├── routes/              auth, customers, products, stock-logs, challans, ai
│       ├── services/            challan.service — ACID confirmChallan
│       ├── middleware/          authenticate, requireRole, validate, errorHandler, rateLimit
│       ├── schemas/             Zod v4 request validation
│       ├── db/                  constraints.ts — CHECK stock ≥ 0, challan_number_seq
│       └── config/              env (Zod-validated), Prisma, Pino logger, Swagger
│
├── render.yaml                  Render Blueprint (auto-deploy backend)
├── vercel.json                  SPA rewrites + asset cache headers
├── docker-compose.yml           Full local stack (Postgres + API + nginx)
└── Dockerfile                   Multi-stage nginx build
```

---

## 🔐 Security Design

| Feature | Implementation |
|---------|----------------|
| **XSS-safe auth** | JWT access token lives in module memory (never `localStorage`); refresh token in `HttpOnly; Secure; SameSite=Strict` cookie |
| **Single-flight refresh** | Concurrent 401 responses share one `refreshPromise` — one round-trip, all requests retry |
| **RBAC** | `requireRole(roles[])` middleware on every protected route; enforced server-side |
| **Rate limiting** | `express-rate-limit` — 10 req/15 min on auth, 300 req/15 min globally |
| **Input validation** | Every request body validated through Zod v4 schemas before hitting the controller |
| **DB constraint backstop** | `CHECK (stock_quantity >= 0)` at the Postgres level — application bug cannot go negative |
| **Helmet** | Security headers on all non-docs routes |
| **CORS** | Reflects request origin with credentials |

---

## ⚙️ Concurrency-Safe Stock Deduction

`confirmChallan` in `server/src/services/challan.service.ts` runs inside a single Prisma `$transaction(ReadCommitted)`:

1. `SELECT ... FOR UPDATE` on the challan row — prevents double-confirm.
2. `SELECT ... WHERE id IN (...) ORDER BY id FOR UPDATE` on all products — consistent lock order prevents deadlock.
3. Collects **all** shortfalls before throwing — caller gets a complete error list.
4. `CHECK (stock_quantity >= 0)` is the final database-level backstop.

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, TypeScript (strict), Tailwind CSS v3 |
| State / Data | TanStack Query v5, Axios |
| Design System | Aetheric Enterprise — dark charcoal `#101417`, Electric Indigo `#c0c1ff`, Geist UI + JetBrains Mono |
| Backend | Node.js 22, Express 5, TypeScript |
| ORM | Prisma 6 |
| Database | PostgreSQL 17 (Neon serverless, Singapore region) |
| Auth | JWT (HttpOnly cookie refresh), Argon2id password hashing |
| AI | OpenAI-compatible client — Groq / OpenRouter / OpenAI |
| Validation | Zod v4 (backend schemas) |
| Logging | Pino + pino-http (structured JSON) |
| API Docs | Swagger UI + swagger-jsdoc |
| Frontend Deploy | Vercel (global CDN) |
| Backend Deploy | Render (Singapore, free tier) |
| Docker | Multi-stage build — nginx (frontend) + Node (API) + Postgres |

---

## 🛠️ Local Development

### Prerequisites
- Node.js ≥ 20
- A PostgreSQL database (or use the Docker Compose stack below)

### Backend

```bash
cd server
cp .env.example .env          # set DATABASE_URL to your Postgres
npm install
npx prisma db push
npm run db:seed               # seeds admin / sales / warehouse / accounts users + sample data
npm run dev                   # http://localhost:4000
```

### Frontend

```bash
# in project root
npm install
echo 'VITE_API_URL=http://localhost:4000/api' > .env.local
npm run dev                   # http://localhost:5173
```

### Full Stack (Docker)

```bash
cp server/.env.example server/.env
docker compose up --build
# Frontend → http://localhost:8080
# API      → http://localhost:4000
# Swagger  → http://localhost:4000/api/docs
```

---

## 🌐 Cloud Deployment

### Backend → Render

1. [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → connect repo.
2. Render auto-detects `render.yaml` and creates `fundsroom-erp-api`.
3. Set two manual env vars:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Neon connection string |
| `CORS_ORIGIN` | Your Vercel frontend URL |

4. Health check: `GET /api/health` → `{"status":"ok"}`

### Frontend → Vercel

1. Import repo on [vercel.com/new](https://vercel.com/new) — framework preset: **Vite**.
2. Add env var: `VITE_API_URL` = `https://<render-slug>.onrender.com/api`
3. Deploy — `vercel.json` handles SPA routing automatically.

---

## 📊 RBAC Matrix

| Module | ADMIN | SALES | WAREHOUSE | ACCOUNTS |
|--------|:-----:|:-----:|:---------:|:--------:|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Customers (CRM) | ✅ | ✅ | — | ✅ |
| Products | ✅ | ✅ | ✅ | — |
| Inventory / Stock Logs | ✅ | — | ✅ | — |
| Sales Challans | ✅ | ✅ | — | ✅ |
| Reports & Analytics | ✅ | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ | ✅ |
| AI Assistant | ✅ | ✅ | — | ✅ |
