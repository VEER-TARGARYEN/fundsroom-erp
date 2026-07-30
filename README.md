<div align="center">

# Fundsroom ERP — Nexus Core

**A production-shaped Mini ERP + CRM for a B2B wholesale business.**
Customers, inventory, GST-compliant sales challans, receivables aging,
an autonomous alert agent, a Groq-powered AI copilot, and a Google
Workspace integration — all running on free tier infrastructure.

[**Live demo**](https://fundsroom-erp-nine.vercel.app) ·
[API](https://fundsroom-erp-api-gve9.onrender.com/api/health) ·
[Swagger](https://fundsroom-erp-api-gve9.onrender.com/api/docs) ·
[Source](https://github.com/VEER-TARGARYEN/fundsroom-erp)

</div>

---

## Try it in 30 seconds

Open the [live app](https://fundsroom-erp-nine.vercel.app) and sign in with
any of the seeded roles (password `Password@123` for all):

| Role | Email | What they can do |
|---|---|---|
| Admin | `admin@fundsroom.in` | Everything |
| Sales | `sales@fundsroom.in` | CRM, products, challans, receivables, AI |
| Warehouse | `warehouse@fundsroom.in` | Products, inventory, stock ledger |
| Accounts | `accounts@fundsroom.in` | Customers, challans, receivables, receipts |

The database holds a realistic **18-month trading history** — 503 customers,
306 products across 7 categories, 25,000 challans, 30,333 receipts,
113k line items, 90k stock movements. Every screen is populated on load.

> **This is a demonstration project**, not a live business. The GST numbers,
> company details and testimonials are placeholders. Anyone can sign in as
> ADMIN — treat it accordingly.

---

## What it does

### Operations
- **CRM** — wholesale/retail customers with GSTIN, follow-up dates, credit terms, notes, full order history.
- **Products** — SKU catalogue with category, unit price, warehouse location, min-stock threshold, inline stock adjustment.
- **Inventory ledger** — every stock movement (purchase in, challan out, manual adjust) recorded with who, when, and why. Immutable; nothing is edited in place.
- **Sales challans** — draft → confirm workflow. Confirmation atomically deducts stock and issues a compliant tax invoice with the CGST/SGST/IGST split.
- **Printable invoices** — A4 tax invoice or delivery challan, browser-native (no PDF library, no server CPU). Amount in Indian lakh/crore words, intra vs inter-state GST from the buyer's state.
- **Receivables + aging** — outstanding balances derived from receipts, 0-30 / 31-60 / 61-90 / 90+ day aging, per-customer top-debtors list, part-payment support with overpayment protection.

### Intelligence
- **AI copilot (Groq)** — answers questions in natural language, grounded in live data. Returns figures, suggestions and a confidence score.
- **Autonomous alert agent** — scans twice a day for stockouts, unconfirmed challans (>3 days), and overdue follow-ups. Groq writes a briefing ranked by money at risk. Delivered as an in-app bell badge and an email digest (Resend).
- **Notifications** — a real table, reconciled each scan. Alerts that persist across scans keep their read state; resolved ones clear automatically.

### Integration
- **Google sign-in** — same JWT session as password login. Fails closed: unknown Google emails cannot self-provision unless allowlisted.
- **Google Workspace** — export data to Sheets (`USER_ENTERED` values so numbers stay numeric), sync customer follow-ups to Calendar (deterministic event ids, so re-sync updates rather than duplicates), and email alert digests from the user's own Gmail. Refresh tokens are encrypted with AES-256-GCM at rest.

---

## Engineering highlights

A quick tour of the non-trivial decisions, with pointers to the code.

### 1 · Concurrency-safe stock and money

Both stock deduction and payment recording protect an invariant that
spans rows — a plain CHECK constraint can't express them.

**Stock** ([`challan.service.ts`](server/src/services/challan.service.ts)) —
`confirmChallan` runs a single `$transaction(ReadCommitted)`:
`SELECT ... FOR UPDATE` on the challan row, then on all products
ordered by id (consistent lock order prevents deadlock). Every shortfall
is collected before throwing, so the caller gets a complete list rather
than the first failure. A CHECK `stock_quantity >= 0` at the DB level
is the last-mile backstop.

**Payments** ([`payment.service.ts`](server/src/services/payment.service.ts)) —
`recordPayment` locks the challan `FOR UPDATE`, sums existing receipts,
then decides. Two clerks recording the closing payment at the same
moment can't both succeed — the second waits, re-reads a sum that
already includes the first, and correctly rejects with `OVERPAYMENT`.
Verified: 0 of 25,000 invoices overpaid across the seeded ledger.

### 2 · GST that follows the actual rules

The backend stores one combined tax amount, but a compliant invoice must
show the CGST/SGST/IGST split. [`splitGst`](src/config/company.ts) derives
it from the buyer's state:

- Same state as the seller → CGST + SGST at half the rate each, with paise-safe halving so the two components always re-sum to the stored total.
- Different state, or unknown → IGST at the full rate. Falling back to IGST is deliberate: showing CGST/SGST on an inter-state supply is a worse mistake.

Amount in words uses Indian **lakh/crore** grouping with singular
"Rupee"/"Paisa" forms — small details that an accounts team notices
immediately if wrong.

### 3 · Session that survives the reload

Deployed across two origins (Vercel frontend, Render API), the refresh
cookie was `SameSite=Strict` by default — so the browser never sent it
cross-site, and every reload dropped users back to the login screen.
Now `SameSite=None; Secure` with a strict CORS allowlist and constant-time
secret comparison. The narrow CSRF surface it opens (POST-only `/auth/refresh`
that mints an access token for whoever already holds the cookie) is
documented in the code alongside the fix.

### 4 · Two-track auth in one session

Password login and Google OAuth issue the **same** JWT session — one
auth model, not two. The OAuth `state` is a signed 10-minute JWT rather
than a server-side session, so a free instance losing memory on spin-down
doesn't break the flow. The Google refresh token, which grants read/write
to a user's Sheets and Calendar and send-mail permission, is encrypted
with AES-256-GCM before it hits the database.

### 5 · The overpayment invariant, checked

Verifying the concurrency guard wasn't optional. I ran the deployed API
with two concurrent payments each worth 60% of the outstanding balance
(sum = 120%). One succeeded, one was rejected with `OVERPAYMENT`, and
`SUM(payments) <= total` held across all 25,000 invoices afterwards.

### 6 · Server-side aggregation

Two silent bugs the seeded data exposed:

- The Reports page originally aggregated a single page of products (100 rows) in the browser, so at 306 SKUs it showed ₹17 Cr of inventory against a true ₹49 Cr and **disagreed with the Dashboard**. Now `SUM(unit_price * stock_quantity)` in the database.
- The Dashboard was firing seven separate requests (five counts, a product page, a challan page) — measured at 2.66 seconds on the free tier. Collapsing into one `/dashboard/summary` cut it to 321 ms (8× faster).

### 7 · Motion that doesn't cost frames

The animation layer is `motion` + `LazyMotion(domAnimation)` + a `strict`
mode that makes stray `motion.div` throw at build time, keeping the
tree-shaken bundle around 29 KB gz. Two bugs found and fixed while
building it:

- Report bars were animating `width` — a **layout** property, reflowing every frame. Now `scaleX` from a left origin: GPU-composited, zero layout.
- `CountUp` was calling `setState` per animation frame — five KPIs meant ~300 React renders/sec. Rewritten to write `textContent` through a ref, off the React commit path entirely.

### 8 · Autonomous agent on free tier

Render cron is a paid feature and free instances spin down after 15
minutes idle, so `setInterval` inside the app is unreliable. The agent
lives at [`agent.service.ts`](server/src/services/agent.service.ts) and
is triggered by a [GitHub Actions cron](.github/workflows/agent-scan.yml)
that first wakes the sleeping instance, then hits a secret-protected
endpoint (constant-time compare). Notifications are a *view* of open
issues — each scan reconciles the table, so re-runs are idempotent and
resolved conditions clear themselves. `UNIQUE(type, entity_id)` is what
makes that safe.

### 9 · Foreign-database respect

The Postgres database is shared with another app that owns nine tables
this project doesn't know about. `prisma migrate reset` or `db push`
would offer to drop them. So new tables (`notifications`, `payments`,
`google_accounts`) are created through **explicit idempotent DDL** at
server boot in [`constraints.ts`](server/src/db/constraints.ts), naming
only the objects this app owns.

---

## Architecture

```
fundsroom-erp/
├── src/                                      React 18 + Vite 5 frontend (64 files)
│   ├── api/                                  Axios client, one hook per resource
│   │   ├── client.ts                         In-memory access token, single-flight 401 retry
│   │   ├── dashboard.api.ts                  useDashboardSummary
│   │   ├── payments.api.ts                   useReceivables, useOpenInvoices, useRecordPayment
│   │   ├── notifications.api.ts              useNotifications, useUnreadCount, useRunScan
│   │   ├── google.api.ts                     useGoogleStatus, useSheetsExport, useCalendarSync
│   │   └── …
│   ├── features/
│   │   ├── marketing/LandingPage.tsx         Public /welcome (hero, features, FAQ)
│   │   ├── auth/                             Login, Google button, AuthContext
│   │   ├── dashboard/DashboardPage.tsx       One-request KPI + activity feed
│   │   ├── customers/                        CRM with drawer detail
│   │   ├── products/                         Catalogue + stock adjustment
│   │   ├── inventory/                        Immutable movement ledger
│   │   ├── challans/
│   │   │   ├── ChallansPage.tsx              List + status filter
│   │   │   ├── ChallanBuilder.tsx            Draft creation + confirm
│   │   │   └── ChallanPrintPage.tsx          A4 tax invoice / delivery challan
│   │   ├── payments/
│   │   │   ├── PaymentsPage.tsx              Receivables, aging, worklist
│   │   │   └── RecordPaymentDialog.tsx       Part-payment with fresh balance
│   │   ├── reports/ReportsPage.tsx           Server-aggregated analytics
│   │   ├── notifications/NotificationsPage.tsx
│   │   ├── ai/AIPage.tsx                     Grounded Groq copilot
│   │   └── settings/
│   │       ├── SettingsPage.tsx              Profile + preferences + security
│   │       └── GoogleWorkspacePanel.tsx      Connect / actions / disconnect
│   ├── components/
│   │   ├── layout/AppShell.tsx               Sidebar + header + command palette
│   │   ├── motion/                           FadeIn, Stagger, StaggerItem, Pressable
│   │   └── ui/                               Aetheric Enterprise design system
│   └── config/company.ts                     Seller identity, GST split, amount-in-words
│
├── server/                                    Node 22 + Express 5 backend (64 files)
│   └── src/
│       ├── routes/                           13 route modules
│       ├── controllers/                      Thin, delegate to services
│       ├── services/                         Business logic (transactions live here)
│       │   ├── challan.service.ts            Atomic confirm + shortfall collection
│       │   ├── payment.service.ts            FOR UPDATE lock + aging queries
│       │   ├── agent.service.ts              Rule detect + reconcile + AI digest
│       │   ├── ai.service.ts                 Grounded system prompt
│       │   ├── google.service.ts             OAuth + token refresh + encryption
│       │   ├── workspace.service.ts          Sheets / Calendar / Gmail calls
│       │   └── mailer.service.ts             Resend HTTP client
│       ├── schemas/                          Zod v4 request validation
│       ├── middleware/                       authenticate, checkRole, rateLimit
│       ├── db/constraints.ts                 Idempotent DDL + CHECK + sequence
│       ├── scripts/
│       │   ├── seed.ts                       4 users + 3 customers + 6 products
│       │   └── seed-demo.ts                  Parameterised bulk generator
│       └── config/                           env (Zod-validated), Prisma, Pino
│
├── .github/workflows/agent-scan.yml          Twice-daily scan (warms → runs)
├── render.yaml                                Render Blueprint (auto-deploy)
└── vercel.json                                SPA rewrites + cache headers
```

**Numbers**: 128 TypeScript files · ~13,000 lines · 35 REST endpoints ·
9 Prisma models · 8 enums · 21 focused commits.

---

## Tech stack

**Frontend** — React 18, Vite 5, TypeScript strict, Tailwind CSS, TanStack
Query v5, Axios, `motion` (via `LazyMotion` for tree-shaking),
React Router v6 with route-level code splitting.

**Backend** — Node 22, Express 5, TypeScript strict, Prisma 6, Zod v4,
Pino (structured JSON logs), `jsonwebtoken`, Argon2id password hashing,
`express-rate-limit`, `helmet`, Swagger UI + `swagger-jsdoc`.

**Data** — PostgreSQL 17 on Neon (Singapore), UUID keys, `DECIMAL(14,2)`
for money, `SELECT FOR UPDATE` for the invariants that matter.

**AI** — Groq (`llama-3.3-70b-versatile`) via any OpenAI-compatible client;
temperature 0.2–0.3; grounded on a compact context blob, not the whole DB.

**Third-party** — Resend for transactional email, Google OAuth 2.0 + Sheets/
Calendar/Gmail APIs (called through native `fetch`, not `googleapis`).

**Ops** — Render (backend, free), Vercel (frontend, free), GitHub Actions
(cron, free), a Docker Compose file for full local stack.

---

## RBAC matrix

| Module | Admin | Sales | Warehouse | Accounts |
|---|:-:|:-:|:-:|:-:|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Customers | ✅ | ✅ | — | ✅ |
| Products | ✅ | ✅ | ✅ | — |
| Inventory | ✅ | — | ✅ | — |
| Sales challans | ✅ | ✅ | — | ✅ |
| **Receivables — view** | ✅ | ✅ | — | ✅ |
| **Receivables — record receipt** | ✅ | — | — | ✅ |
| **Receivables — reverse receipt** | ✅ | — | — | — |
| Reports | ✅ | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ | ✅ |
| AI copilot | ✅ | ✅ | — | ✅ |
| **Run agent scan (manual)** | ✅ | — | — | — |

Enforced server-side on every protected route — the frontend hides UI as a
courtesy, never as a security boundary.

---

## Security

| Layer | What it does |
|---|---|
| **JWT access** | Short-lived (15 min), held in module memory — never `localStorage`, so XSS can't exfiltrate it |
| **Refresh cookie** | `HttpOnly; Secure; SameSite=None`, scoped to `/api/auth`, rotated on every use |
| **Password hashing** | Argon2id |
| **Rate limiting** | Global 300/15min · auth 10/15min · AI 15/min · Workspace 15/min |
| **Zod validation** | Every body/query/param, coerced and bounded, before controllers |
| **CORS** | Explicit allowlist, comma-separated env var, normalized (case + trailing slash) at boot |
| **Google tokens** | AES-256-GCM (authenticated encryption) at rest |
| **OAuth CSRF** | Signed 10-min JWT `state`, HS256 with the access secret |
| **Agent secret** | Constant-time compare (`timingSafeEqual`) |
| **DB CHECK** | `products.stock_quantity >= 0` and `payments.amount > 0` |

Documented per-file in the code alongside the fix — grep for `Why:` and
`SameSite` and `overpayment` for the interesting bits.

---

## Local development

**Prerequisites** — Node 20+, a PostgreSQL database (or Docker Compose).

**Backend**
```bash
cd server
cp .env.example .env      # set DATABASE_URL, at minimum
npm install
npm run db:seed           # 4 users + 3 customers + 6 products
npm run db:seed:demo      # optional: full 258k-row dataset
npm run dev               # http://localhost:4000
```

**Frontend**
```bash
npm install
echo 'VITE_API_URL=http://localhost:4000/api' > .env.local
npm run dev               # http://localhost:5173
```

**Everything (Docker)**
```bash
cp server/.env.example server/.env
docker compose up --build
# Frontend → http://localhost:8080
# API      → http://localhost:4000
# Swagger  → http://localhost:4000/api/docs
```

**Bulk demo data (parameterised)**
```bash
cd server
DEMO_RESET=true \
DEMO_CUSTOMERS=500 DEMO_PRODUCTS=300 DEMO_CHALLANS=25000 \
  npm run db:seed:demo
```
Also `VACUUM ANALYZE`s afterwards (bulk inserts leave stale planner
statistics; measured 2× slower API latency until this runs).

---

## Deployment

Backend on Render (`render.yaml` blueprint), frontend on Vercel (Vite
preset). Scheduled agent scan on GitHub Actions cron. Full setup lives in
the private runbook — the deployed instance uses:

- Render free web service · Vercel Hobby · Neon Postgres free (shared)
- GitHub Actions cron (2000 min/month, plenty for a twice-daily scan)
- Groq (free) · Resend (free 3k/month)

All optional. If `AI_API_KEY` is unset, AI endpoints return a clean 503
and everything else keeps working. If `RESEND_API_KEY` is unset, the agent
still records alerts — it just doesn't email.

---

## What's next

- **Purchase orders + goods-inward** — `PURCHASE_IN` exists in the enum with no UI yet, so stock can only go down through the app
- **Audit log** — who confirmed/cancelled/adjusted what
- **Refresh-token rotation with reuse detection** — token family + revoke-on-reuse

Everything currently shipped is verified end to end on the deployed stack.

---

## License

MIT — see [LICENSE](LICENSE).

<div align="center">
<sub>Built by <a href="https://github.com/VEER-TARGARYEN">VEER-TARGARYEN</a>. A demonstration project — not a real business.</sub>
</div>
