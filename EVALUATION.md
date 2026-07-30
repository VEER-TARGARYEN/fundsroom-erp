# Fundsroom ERP — Nexus Core

**Technical evaluation document**

Prepared for review · 30 July 2026

---

## Contents

1. Executive summary
2. Reviewer quickstart — how to see everything in 15 minutes
3. Live URLs and demo access
4. What was built, by module
5. Engineering decisions worth reviewing
6. What was verified, and how
7. Trade-offs and known limitations
8. Roadmap
9. Repository map
10. Contact

---

## 1 · Executive summary

Fundsroom ERP is a production-shaped mini ERP for a B2B wholesale
business, deployed on free-tier infrastructure and running against a
seeded 18-month trading history.

The application covers CRM, product catalogue, immutable stock ledger,
GST-compliant sales challans with printable invoices, receivables with
aging analysis, a natural-language AI copilot grounded in live data, an
autonomous operations agent that watches for stockouts and unconfirmed
orders, and a Google Workspace integration (Sheets export, Calendar sync,
Gmail digest).

Every screen is populated with realistic data on load: 503 customers,
306 products, 25,000 confirmed challans across 18 months, 30,333
receipts, and enough variety in the aging profile that all four buckets
(0-30 / 31-60 / 61-90 / 90+ days) contain material data.

Everything shipped has been verified end-to-end on the deployed stack,
not just tested locally.

**Scale**: 128 TypeScript files, ~13,000 lines, 35 REST endpoints,
9 Prisma models, 21 focused commits on `main`.

**Stack**: React 18 + Vite 5 + TanStack Query on the frontend, Express 5 +
Prisma 6 + PostgreSQL on the backend, JWT sessions with an HttpOnly
refresh cookie, RBAC across 4 roles, Groq for language, Resend for email,
Google OAuth for sign-in and Workspace.

---

## 2 · Reviewer quickstart

For a **15-minute assessment**, this is the recommended path:

1. **Land** on <https://fundsroom-erp-nine.vercel.app> — the marketing landing page briefly explains what the product is.
2. **Sign in** as ADMIN (`admin@fundsroom.in` / `Password@123`). The dashboard should populate within ~1 second (~50 s cold start if the free instance was sleeping).
3. **Receivables** in the sidebar — the aging chart, top debtors, and open-invoice worklist. Click the payment icon on any row to see the record-payment dialog (fresh balance, part-payment support, existing receipts listed).
4. **Sales Challans** → any row → **printer icon**. A confirmed challan renders as a compliant tax invoice with the correct CGST/SGST split for intra-state buyers (Maharashtra) or IGST for others (Tamil Nadu, Gujarat, …). A DRAFT prints as a delivery challan and explicitly says it is not a tax invoice.
5. **AI Assistant** → ask *"Which challans are highest risk to collections?"* — grounded in live data, returns figures with a confidence score.
6. **Notifications** → 271 open alerts, filterable, with an admin-only Run Scan button that regenerates them. On the deployed stack this uses Groq to produce an AI briefing ranked by money at risk.
7. **Settings → Google Workspace** — connect a Google account (you must be added as a Test user in the OAuth consent screen), then Export to Sheets creates a real spreadsheet in your Drive with two tabs, USER_ENTERED number formatting, bold headers, frozen top row.
8. **Sign in as WAREHOUSE** (`warehouse@fundsroom.in`). Different sidebar, no financials — RBAC is enforced server-side, not just in the UI.

**To review the code**, the highest-signal files are:

| File | Why |
|---|---|
| `server/src/services/challan.service.ts` | ACID confirm — the trickiest correctness path |
| `server/src/services/payment.service.ts` | Overpayment guard + aging queries |
| `server/src/services/agent.service.ts` | Reconcile-not-append design |
| `server/src/services/google.service.ts` | OAuth flow + token encryption |
| `server/src/db/constraints.ts` | Idempotent DDL over a shared database |
| `src/config/company.ts` | GST split + amount-in-words |
| `src/features/challans/ChallanPrintPage.tsx` | Browser-native print invoice |
| `src/features/payments/PaymentsPage.tsx` | Aging chart + receivables dashboard |
| `src/features/marketing/LandingPage.tsx` | Public marketing page |
| `.github/workflows/agent-scan.yml` | Free-tier cron with warm-up |

---

## 3 · Live URLs and demo access

| Service | URL |
|---|---|
| Frontend (Vercel) | https://fundsroom-erp-nine.vercel.app |
| Backend API (Render) | https://fundsroom-erp-api-gve9.onrender.com |
| Swagger / OpenAPI | https://fundsroom-erp-api-gve9.onrender.com/api/docs |
| Health check | https://fundsroom-erp-api-gve9.onrender.com/api/health |
| Source (public) | https://github.com/VEER-TARGARYEN/fundsroom-erp |
| GitHub Actions cron runs | https://github.com/VEER-TARGARYEN/fundsroom-erp/actions |

**Demo credentials** (all use password `Password@123`):

| Role | Email | Access |
|---|---|---|
| Admin | `admin@fundsroom.in` | Full system |
| Sales | `sales@fundsroom.in` | CRM, products, challans, AI, receivables (view-only) |
| Warehouse | `warehouse@fundsroom.in` | Products, inventory ledger |
| Accounts | `accounts@fundsroom.in` | Customers, challans, receipts, AI |

The free-tier backend sleeps after 15 minutes of inactivity. The first
request wakes it in about 50 seconds. Subsequent requests are 200-750 ms
depending on the endpoint. This behaviour is not the application's — it is
Render's free tier.

---

## 4 · What was built, by module

### 4.1 Public landing page

A marketing home page at `/welcome`, styled after Render/GitHub/Vercel: a
hero with two CTAs, live stat tiles (populated from the app's own numbers),
9 feature cards with hover motion, a three-step "how it works", role-based
example testimonials (labelled on the page as illustrative), tech-stack
chips, an FAQ accordion, and a bottom CTA. Signed-out visitors to `/` are
redirected here rather than dumped on a login form.

### 4.2 Authentication

Password login and Google OAuth issue the **same** JWT session. Access
tokens are short-lived (15 min) and held in module memory — never
`localStorage`, so an XSS bug can't exfiltrate them. Refresh tokens live
in an `HttpOnly; Secure; SameSite=None` cookie scoped to `/api/auth`, and
are rotated on each use.

Google sign-in fails closed: an unknown Google email cannot self-provision
unless it is on the `GOOGLE_ALLOWED_EMAILS` allowlist. Unverified emails
are refused outright — matching on one would be an account-takeover path.

The OAuth `state` parameter is a signed 10-minute JWT rather than a
server-side session, which lets the flow survive Render's spin-down
without a session store.

### 4.3 CRM

Full CRUD for wholesale/retail customers with business name, contact
person, mobile, email, GSTIN, addresses, follow-up dates, status
(ACTIVE / LEAD / INACTIVE), and free-text notes. Search, filters, and a
detail drawer with recent challan history.

### 4.4 Products

Product catalogue with SKU, category, unit price (`DECIMAL(12,2)`), stock
quantity, min-stock threshold, and warehouse location. Inline stock
adjustment writes an immutable log entry with reason.

### 4.5 Inventory ledger

Every stock movement is a row: `PURCHASE_IN`, `CHALLAN_OUT`, or
`MANUAL_ADJUST`. Signed quantity change, reason, actor, timestamp.
Nothing is ever edited in place. This is the audit trail that reconciles
current stock to its history — a real ERP requirement, not a UI decoration.

### 4.6 Sales challans

The heart of the business flow. Draft creation is unrestricted; **confirm**
runs a single `$transaction(ReadCommitted)`:

1. `SELECT ... FOR UPDATE` on the challan (prevents double-confirm).
2. `SELECT ... FOR UPDATE` on all referenced products, ordered by id (consistent lock order → no deadlock possible between two concurrent confirms of different challans that share products).
3. Verifies every line, **collecting all shortfalls** before throwing — the client gets the complete list of insufficient SKUs, not just the first.
4. Deducts stock, writes `CHALLAN_OUT` log entries, timestamps the challan.
5. `CHECK (stock_quantity >= 0)` at the database level is the final backstop.

Cancellation of a CONFIRMED challan is symmetric: restock in one
transaction, log the reversal.

### 4.7 Printable GST invoices

`/challans/:id/print` renders an A4 tax invoice (or delivery challan for
drafts) rendered by the browser's own print engine — no PDF library, no
server CPU. The invoice includes:

- Seller identity with GSTIN, PAN, address.
- Bill-to / ship-to with buyer GSTIN and state.
- Line items with SKU, quantity, rate, amount.
- **GST split**: CGST + SGST for intra-state, IGST for inter-state. Derived from `splitGst(taxAmount, buyerState)` — an unknown buyer state falls back to IGST, which is the safer error. Paise are halved with rounding so the two components always re-sum to the stored total.
- **Amount in words** in Indian lakh/crore grouping with singular Rupee/Paisa forms.
- Bank details, T&Cs, signatory block, computer-generated disclaimer.
- Correct page-break behaviour, repeating table headers on long invoices.

Verified across intra-state (Maharashtra buyer, CGST + SGST), inter-state
(Tamil Nadu buyer, IGST only), and DRAFT (delivery challan with explicit
"not a tax invoice" warning).

### 4.8 Receivables + aging

Outstanding balances are **always derived** as `total - SUM(payments)` —
never stored on the challan. A cached balance and a receipt row can
disagree after a partial failure; a derived one cannot.

The receivables page shows:

- **Four KPIs** with animated count-up: total outstanding, overdue (30d+), collected this month, average days to pay.
- **Aging chart** — a stacked bar plus a table of the four buckets with invoice count, amount, and percentage.
- **Top debtors** — outstanding by customer with oldest-invoice age badges.
- **Open-invoice worklist** — oldest first, with per-row print and record-payment actions.
- **Receipt history** tab with method badges and references.

Recording a payment locks the challan `FOR UPDATE`, re-reads the current
sum, and rejects overpayment with the exact outstanding figure. Part
payments are supported; the amount is bounded on both sides.

Full concurrency evidence in **Section 6**.

### 4.9 Reports & analytics

`GET /api/reports/summary` aggregates the entire catalogue and sales
history in the database — not in the browser. Fixed a real bug the seeded
data exposed: the previous client-side aggregation over 100 rows reported
₹17 Cr against a true ₹49 Cr and disagreed with the dashboard.

CSV export moved server-side too — a client-side export over 18,035
confirmed sales would have needed ~180 paginated requests.

### 4.10 AI copilot

`POST /api/ai/assistant` sends a compact context blob (counts, current
low-stock rows, aging summary) to a Groq LLM with a role-tuned system
prompt. Returns:

- Answer text
- Confidence score (0-1)
- Tags (Inventory, Reordering, CRM, …)
- Suggested follow-up questions

Grounded on a summary, not the whole database — the model never sees
individual customer PII beyond what its answer needs to cite.

### 4.11 Autonomous operations agent

The notifications table is a **live view of open issues**, not an
append-only log. Each scan reconciles it: inserts conditions that have
become true, deletes rows whose condition no longer holds. Alerts that
persist across scans keep their read state.

Rules:

- `OUT_OF_STOCK` — critical severity
- `LOW_STOCK` — at or below minimum
- `DRAFT_STALE` — DRAFT challan older than 3 days
- `FOLLOW_UP_DUE` — customer follow-up date due or overdue

`UNIQUE(type, entity_id)` is what makes re-running idempotent. Verified:
second scan created 0 and resolved 0. Driving a product to 0 stock
transitioned it LOW_STOCK → OUT_OF_STOCK (critical). Restocking another
resolved its alert away.

Scheduling: **GitHub Actions cron** at 09:00 and 13:00 IST. The workflow
warms the sleeping Render instance first (waits for a healthy `/health`),
then calls `POST /api/agent/scan` with an `x-agent-secret` header,
compared in constant time.

Delivery: in-app bell badge (polled every 2 minutes) plus an HTML email
digest through Resend, ranked by severity. Only scheduled runs email;
manual "Run scan" from the UI stays silent so demoing never spams.

The AI briefing is generated by Groq on top of the raw alerts — it ranks
them by money at risk and cites specific SKUs and challan numbers.

### 4.12 Google Workspace

**Sign in with Google** issues the standard JWT session. **Connect
Workspace** (via `?intent=connect` on the same start endpoint) requests
Sheets, Drive.file, Calendar.events, and Gmail.send scopes.

- **Sheets export** — creates a spreadsheet with two tabs (Products, Sales), writes with `USER_ENTERED` so numbers land as numbers, applies bold header + frozen row + auto-resized columns in a single batch request.
- **Calendar sync** — creates one all-day event per due follow-up. Deterministic event id derived from the customer, so re-syncing updates rather than duplicates.
- **Gmail digest** — sends the current open-alerts snapshot from the user's own Gmail. The endpoint composes its own body and accepts no caller content, so it cannot be used as an open relay.

Google refresh tokens are encrypted with **AES-256-GCM** (authenticated
encryption) before storage. Google returns a refresh token only on first
consent, so the code never overwrites a stored one with null on
re-authorisation.

REST called through native `fetch` — `googleapis` would have added tens of
megabytes for four request types.

### 4.13 Design system + motion

Custom design system called **Aetheric Enterprise**: dark charcoal
`#101417` surfaces, Electric Indigo `#c0c1ff` accent, Geist UI, JetBrains
Mono for numbers, Material Symbols Outlined for icons.

Motion layer built on `motion` + `LazyMotion(domAnimation)` with `strict`
mode. Everything animates only opacity or transform, so nothing costs
layout. Route-level enter/exit transitions, staggered list entry, KPI
count-up, animated chart fills, and a spring pop on the unread badge when
the count changes. All routed through `useReducedMotion()` so the OS
"reduce motion" setting is honoured in one place rather than per call
site.

---

## 5 · Engineering decisions worth reviewing

### 5.1 SameSite=Strict silently broke sessions

Deployed across two origins (`vercel.app` frontend, `onrender.com` API),
the refresh cookie was `SameSite=Strict` by default — so the browser
**never sent it cross-site**. Every reload dropped users back to login.

Fixed to `SameSite=None; Secure`. The narrow CSRF surface it opens is
documented in the code:

> `/auth/refresh` is POST-only and merely mints an access token for whoever
> already holds the cookie. The CORS allowlist stops other origins from
> reading the response, and requests without a bearer for downstream calls
> are 401.

This one bug is worth flagging because it's exactly the kind of silent
failure that ships to production and looks like a "sometimes users get
logged out" complaint for weeks.

### 5.2 CORS trailing-slash sensitivity

Same category. A browser's `Origin` header never has a trailing slash, but
a URL pasted from an address bar usually does — so `https://…vercel.app/`
in the dashboard never matched `https://…vercel.app` from the browser.
Now both sides are normalized (lowercase, strip trailing slash) at boot,
and the effective allowlist is logged at boot for diagnosis:

```
🔐 CORS allowlist  ["https://fundsroom-erp-nine.vercel.app"]
```

### 5.3 Server-side aggregation everywhere it matters

Two silent under-reporting bugs the seeded data exposed:

**Dashboard** — was firing seven requests: five counts, a 100-row product
page (for inventory value), and a challan page for recent activity.
Measured 2666 ms on the deployed stack. Collapsed into `GET
/api/dashboard/summary` returning everything in one `Promise.all`. New
timing: **321 ms** — 8× faster.

**Reports** — was aggregating client-side over the first 100 products.
At 306 SKUs it reported ₹17 Cr of inventory value against a true ₹49 Cr,
and disagreed with the dashboard. Now `SUM(unit_price * stock_quantity)`
in Postgres. Both pages now agree.

### 5.4 Route-level code splitting + LazyMotion

`motion` naively pulls its whole feature set into the entry bundle
(measured `+47 kB` gzipped). The fix was `LazyMotion(domAnimation)` +
`strict` mode, which tree-shakes the unused features and makes a stray
`motion.div` throw at build time so it can't sneak back in.

Vendor chunking splits react/router/query/motion out of the app code.
First-load total is ~128 kB gz, but repeat visits only re-download the
app chunk (~10 kB gz) — the vendor hashes stay stable across most
deploys.

### 5.5 requestAnimationFrame doesn't fire in hidden tabs

Caught this because I verify on the deployed URL, not just locally:
`CountUp` was leaving KPIs stuck at 0 in a backgrounded tab. `document.hidden`
short-circuits to the final value now, plus a timeout backstop since
timers fire when frames don't.

### 5.6 Foreign-database respect (idempotent DDL over Prisma)

The Neon database is shared with another application that owns nine
tables this project doesn't have in `schema.prisma`. `prisma migrate reset`
or `db push --force-reset` would offer to drop them.

So new tables (`notifications`, `payments`, `google_accounts`) are created
through **explicit idempotent DDL** at server boot in
`db/constraints.ts`, naming only the objects this app owns. `CREATE TABLE
IF NOT EXISTS`, `CREATE TYPE ... IF NOT EXISTS` inside a `DO $$` block,
`CREATE INDEX IF NOT EXISTS`. Safe to run on every boot.

### 5.7 Encrypting third-party tokens at rest

The Google refresh token grants read/write to a user's Sheets and
Calendar and the ability to send mail as them. A database leak shouldn't
hand those over.

`src/utils/crypto.ts` uses **AES-256-GCM** — chosen over CBC because it
authenticates as well as encrypts, so a tampered ciphertext fails to
decrypt rather than yielding garbage that later code might act on. Format:
`v1.<iv-b64>.<tag-b64>.<ciphertext-b64>`. Key is derived via SHA-256, so
whatever `TOKEN_ENC_KEY` you set works even if it isn't exactly 32 bytes.

### 5.8 OAuth state as a signed JWT

Rather than a server-side session (which would need a store, and Render's
free instance loses memory on spin-down), the `state` parameter is a
short-lived signed JWT — HS256 with the access secret, 10-minute expiry,
carrying the intent and redirect. It's the CSRF defence, and it survives
a cold start naturally.

### 5.9 Amount in words with Indian grouping

Small but visible. The naive Western `Intl` grouping gives "One Million
Two Hundred Thousand"; a compliant Indian invoice expects "Twelve Lakh
Thirty Four Thousand Five Hundred Sixty Seven". `amountInWords()` gets
the grouping right, with singular "Rupee" / "Paisa" forms — "One Rupees"
is exactly the kind of thing an accounts team notices immediately.

### 5.10 The demo seeder is deterministic and idempotent

`seed-demo.ts` uses a seeded PRNG, reserves a contiguous block of challan
numbers and advances the sequence past the end (so the running app can't
collide with seeded data), reconciles stock to the ledger and clamps at
zero (satisfies the CHECK constraint), and `VACUUM ANALYZE`s afterwards
because bulk inserts leave no planner statistics — measured 2× slower API
responses until this runs.

Parameterised: `DEMO_CUSTOMERS=500 DEMO_PRODUCTS=300 DEMO_CHALLANS=25000
npm run db:seed:demo`. `DEMO_RESET=true` clears only this project's
tables, never the shared ones.

---

## 6 · What was verified, and how

Every claim below was checked against the deployed stack, not just
locally.

### 6.1 Overpayment cannot happen under concurrency

Two concurrent HTTP POSTs against the same challan, each carrying 60% of
the current outstanding balance (sum = 120%):

```
req1: ACCEPTED  outstanding now 132,009.35
req2: REJECTED  OVERPAYMENT
```

Then the invariant checked across the whole ledger:

```sql
SELECT COUNT(*) FROM (
  SELECT c.id FROM challans c JOIN payments pm ON pm.challan_id = c.id
   WHERE c.status = 'CONFIRMED'
   GROUP BY c.id, c.total_amount
  HAVING SUM(pm.amount) > c.total_amount
) t
```

Result: `0 of 25,000 confirmed invoices paid beyond their total`. Invariant
holds.

### 6.2 Alert agent is idempotent

Ran the scan twice in a row:

```
run 1: detected 272  created 272  resolved 0  open 272
run 2: detected 272  created 0    resolved 0  open 272
```

Then a real transition: dropped a product to 0 stock, restocked another,
re-ran:

```
run 3: detected 271  created 1    resolved 2  open 271
       byType: {OUT_OF_STOCK: 1, LOW_STOCK: 18, DRAFT_STALE: 200, FOLLOW_UP_DUE: 52}
```

One `LOW_STOCK` → `OUT_OF_STOCK` (critical), one `LOW_STOCK` resolved.

### 6.3 CORS allow/deny

Live production API:

```
Origin: https://fundsroom-erp-nine.vercel.app       → allowed
Origin: https://evil-attacker.com                   → blocked
Origin: https://fundsroom-erp-evil.vercel.app       → blocked  (lookalike subdomain)
No Origin (curl / health check)                     → allowed  (not a cross-site request)
```

### 6.4 RBAC matrix on the payments endpoints

All four roles hit each of the three payment operations:

|                  | view | record | reverse |
|---|:---:|:---:|:---:|
| ADMIN     | 200 | 201 | 200 |
| SALES     | 200 | 403 | 403 |
| ACCOUNTS  | 200 | 201 | 403 |
| WAREHOUSE | 403 | 403 | 403 |

Matches the RBAC matrix without a single hardcoded frontend check being
the boundary.

### 6.5 GST split correctness

Print view rendered on the deployed frontend across three cases:

| Buyer state | Doc type | Tax split |
|---|---|---|
| Maharashtra (seller state) | TAX INVOICE | CGST ₹70,827.07 + SGST ₹70,827.06 (halves re-sum to stored total) |
| Tamil Nadu | TAX INVOICE | IGST only, no CGST/SGST |
| DRAFT status | DELIVERY CHALLAN | Explicit "not a tax invoice" warning |

Rounding verified across `[0, 720, 12500, 158000, 490598207.34, -45000]`
and the compact currency formatter across `[720, 158k, 4.9 Cr, 1.08 lakh
crore]` — the previous compact format degraded past a lakh-crore and
rendered `₹1KCr`.

### 6.6 Session survives reload

Deployed URL:

1. Sign in as ADMIN → dashboard renders.
2. `location.reload()` in the browser console.
3. **Still on `/`, still Aarav.**

This is the fix for the SameSite bug (5.1) — verified end-to-end, not
just via a curl of the Set-Cookie header.

---

## 7 · Trade-offs and known limitations

### Free-tier realities

- **Cold start ~50s**. Render's free web service sleeps after 15 minutes idle. The first request after sleep takes ~50 seconds. Subsequent requests are 200-750 ms. The `agent-scan.yml` workflow warms the instance before scanning.
- **~1 s aggregate latency**. The receivables endpoint runs `challans LEFT JOIN payments` across 25k × 30k rows on 0.25 vCPU Neon. Cached 60 s client-side (`staleTime`), so the user pays it once per screen open. A nightly materialised summary is the natural next step at real scale.
- **Neon storage shared** with another application. Currently at ~121 MB / ~0.5 GB. `challan_items` alone is 59 MB — millions of rows would exceed the free tier by orders of magnitude.

### Deliberate scope cuts

- **No purchase orders / goods-inward** yet. `PURCHASE_IN` exists in the enum with no UI behind it, so stock only ever goes down through the app.
- **No SMS delivery**. India requires TRAI DLT registration — every template pre-approved through a telecom operator, and per-message cost. There is no free path. The provider seam is `mailer.service.ts`; SMS slots in there.
- **Google refresh tokens expire after 7 days in Testing mode**. This is a Google OAuth policy for consent screens not yet verified — moving to production requires Google's app verification, and `gmail.send` is a **restricted** scope that additionally requires a paid third-party security assessment.
- **Landing-page testimonials are illustrative**, labelled as such on the page. This is a demo application; inventing attributed quotes would be fabricating evidence.
- **`DRAFT_STALE` alerts capped at 200 per scan** (ordered by value, deterministic). With 4,432 stale challans in the demo data, most are not individually alerted.
- **No audit log**. Enterprise buyers ask for one; would be a natural next feature.
- **Repo is public**. Demo credentials are in the README on purpose (portfolio project) — anyone can sign in as ADMIN. Fine for a demonstration; would be the first thing to remove for anything real.

---

## 8 · Roadmap

Given ranked ordering, the next three features are self-contained and
would each ship in one or two focused sessions:

1. **Purchase orders + goods-inward** — supplier model, PO header + lines, partial goods-inward, wires up `PURCHASE_IN` so stock can go up through the UI. Largest schema change of the three.
2. **Audit log** — one immutable table capturing every business-effect operation (challan confirm/cancel, stock adjust, payment record/reverse, product edit). Read-only in the UI, filterable by actor and date range.
3. **Refresh-token rotation with reuse detection** — token family stored per session; if an already-used refresh token reappears, revoke the whole family. Catches stolen tokens.

Longer-term ideas (not planned yet): multi-warehouse transfers,
demand-forecasting reorder-point suggestions from stock-log velocity, a
barcode scanner (PWA using the device camera), multi-tenant org
isolation.

---

## 9 · Repository map

```
fundsroom-erp/
├── README.md                       Public-facing project doc
├── EVALUATION.md                   This document
├── LICENSE                         MIT
│
├── src/                            Frontend (64 TS/TSX files)
├── server/                         Backend (64 TS files)
│
├── .github/
│   └── workflows/
│       └── agent-scan.yml          Twice-daily agent cron
│
├── render.yaml                     Render Blueprint
├── vercel.json                     SPA rewrites + cache
├── docker-compose.yml              Full local stack
└── Dockerfile                      Multi-stage frontend build
```

Detailed frontend/backend structure is in `README.md § Architecture`.

---

## 10 · Contact

- **GitHub**: [github.com/VEER-TARGARYEN](https://github.com/VEER-TARGARYEN)
- **Live demo**: [fundsroom-erp-nine.vercel.app](https://fundsroom-erp-nine.vercel.app)
- **Source**: [github.com/VEER-TARGARYEN/fundsroom-erp](https://github.com/VEER-TARGARYEN/fundsroom-erp)

---

*This is a demonstration project intended for portfolio and evaluation
purposes. It is not affiliated with any real company. The GST number,
address, bank details and testimonials on the invoice and landing page
are placeholders; any resemblance to a real business is coincidental.*
