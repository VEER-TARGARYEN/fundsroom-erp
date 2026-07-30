import { Link } from 'react-router-dom'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { GoogleButton } from '@/components/GoogleButton'
import { FadeIn, Stagger, StaggerItem, Pressable } from '@/components/motion'
import { useAuth } from '@/features/auth/AuthContext'

const FEATURES = [
  {
    icon: 'groups',
    title: 'CRM & customer book',
    body: 'Wholesale and retail accounts with GSTIN, credit terms, follow-up dates and full order history in one place.',
  },
  {
    icon: 'inventory_2',
    title: 'Inventory that cannot go negative',
    body: 'Stock is guarded by a database CHECK constraint, not just app logic. Row-level locks make concurrent dispatch safe.',
  },
  {
    icon: 'receipt_long',
    title: 'Sales challans with GST',
    body: 'Atomic confirmation deducts stock in a single transaction, collecting every shortfall before it fails — never a half-applied order.',
  },
  {
    icon: 'swap_vert',
    title: 'Immutable stock ledger',
    body: 'Every movement — purchase in, challan out, manual adjustment — recorded with who, when and why. Nothing is edited in place.',
  },
  {
    icon: 'monitoring',
    title: 'Analytics over every row',
    body: 'Sales value, inventory valuation, category mix and top customers aggregated in the database, not sampled from a page.',
  },
  {
    icon: 'auto_awesome',
    title: 'Grounded AI copilot',
    body: 'Ask questions in plain language. Answers are computed from your live data, with the figures it used shown alongside.',
  },
  {
    icon: 'radar',
    title: 'Autonomous alert agent',
    body: 'Scans twice a day for stockouts, stale challans and overdue follow-ups, then emails a briefing ranked by money at risk.',
  },
  {
    icon: 'shield_lock',
    title: 'Role-based access',
    body: 'Admin, Sales, Warehouse and Accounts each see only their modules. Enforced on the server, not hidden in the UI.',
  },
  {
    icon: 'table_chart',
    title: 'Google Workspace',
    body: 'Push data to Sheets, put follow-ups on Calendar, and send alert digests from your own Gmail.',
  },
]

const STATS = [
  { value: '228k+', label: 'rows in the live demo' },
  { value: '<750ms', label: 'API response at that scale' },
  { value: '4', label: 'roles with distinct access' },
  { value: '18 mo', label: 'of trading history seeded' },
]

const STACK = [
  'React 18', 'TypeScript', 'Vite', 'Tailwind', 'TanStack Query',
  'Express 5', 'Prisma 6', 'PostgreSQL', 'JWT', 'Groq LLM',
]

/**
 * Illustrative copy, not real customers.
 *
 * This is a portfolio/demo product with no userbase, so inventing attributed
 * testimonials would be fabricating evidence. These are written as the kind of
 * feedback each role would give, and the section says so plainly on the page.
 */
const PERSONAS = [
  {
    role: 'Operations lead',
    initials: 'OL',
    quote:
      'The alert briefing is the part that changed my mornings — it opens with the two challans holding the most money, not a list of 200 rows to triage.',
  },
  {
    role: 'Warehouse supervisor',
    initials: 'WS',
    quote:
      'Confirming a dispatch either works or tells me exactly which SKUs are short. It has never once left stock in a half-updated state.',
  },
  {
    role: 'Accounts',
    initials: 'AC',
    quote:
      'One click puts products and confirmed sales into a Google Sheet with real numbers and dates, so I can pivot it without cleaning a CSV first.',
  },
]

const FAQ = [
  {
    q: 'Can I try it without signing up?',
    a: 'Yes — four demo accounts are pre-seeded, one per role, and the password is shown on the sign-in page. The data is a full 18-month trading history.',
  },
  {
    q: 'Is my Google account safe to connect?',
    a: 'Connecting is optional and separate from signing in. Refresh tokens are encrypted with AES-256-GCM before storage, and you can revoke access from Settings at any time.',
  },
  {
    q: 'What happens to stock if two people dispatch at once?',
    a: 'Challan confirmation takes row-level locks in a consistent order inside one transaction, so concurrent confirmations serialise instead of racing. A database CHECK constraint is the final backstop.',
  },
  {
    q: 'Does the AI see my data?',
    a: 'The copilot is sent a small computed summary — counts and the specific rows relevant to your question — not your whole database. Turn it off by removing the API key and every other feature keeps working.',
  },
]

function Nav() {
  const { status } = useAuth()
  return (
    <header className="sticky top-0 z-40 border-b border-outline-variant/10 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/welcome" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-primary text-on-primary">
            <Icon name="deployed_code" size={20} />
          </span>
          <span className="text-title-md font-medium tracking-tight text-on-surface">Nexus Core</span>
        </Link>

        <nav className="ml-6 hidden items-center gap-6 md:flex">
          {[
            ['Features', '#features'],
            ['How it works', '#how'],
            ['FAQ', '#faq'],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="text-body-sm text-on-surface-variant transition-colors hover:text-on-surface"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            href="https://github.com/VEER-TARGARYEN/fundsroom-erp"
            target="_blank"
            rel="noreferrer noopener"
            className="hidden rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface sm:block"
            aria-label="Source on GitHub"
          >
            <Icon name="code" size={20} />
          </a>
          {status === 'authenticated' ? (
            <Link to="/">
              <Button size="sm" icon="dashboard">
                Open dashboard
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link to="/login">
                <Button size="sm" icon="arrow_forward">
                  Get started
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export function LandingPage() {
  const { status } = useAuth()

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="ai-glow pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-secondary-container/10 blur-[130px]" />
        <div className="pointer-events-none absolute -right-40 top-40 h-96 w-96 rounded-full bg-primary/5 blur-[130px]" />

        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <FadeIn>
            <Badge tone="indigo" className="mb-5">
              <Icon name="auto_awesome" size={13} />
              AI copilot + autonomous alert agent
            </Badge>
          </FadeIn>

          <FadeIn delay={0.06}>
            <h1 className="max-w-3xl text-display-sm font-medium leading-tight tracking-tight text-on-surface lg:text-[3.25rem]">
              The operations backbone for a{' '}
              <span className="text-secondary">wholesale business</span>
            </h1>
          </FadeIn>

          <FadeIn delay={0.12}>
            <p className="mt-5 max-w-2xl text-body-md leading-relaxed text-on-surface-variant lg:text-lg">
              Customers, inventory, GST challans and a stock ledger that reconciles — with an AI
              agent that watches for stockouts and unconfirmed orders, and tells you what is costing
              you money today.
            </p>
          </FadeIn>

          <FadeIn delay={0.18}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link to={status === 'authenticated' ? '/' : '/login'}>
                <Button size="md" icon="rocket_launch" className="w-full sm:w-auto">
                  {status === 'authenticated' ? 'Open dashboard' : 'Try the live demo'}
                </Button>
              </Link>
              {status !== 'authenticated' && (
                <div className="sm:w-64">
                  <GoogleButton label="Sign up with Google" />
                </div>
              )}
            </div>
            <p className="mt-3 text-body-sm text-on-surface-variant/70">
              No card, no setup — demo accounts for all four roles are pre-loaded.
            </p>
          </FadeIn>

          {/* Stats */}
          <Stagger className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-4" gap={0.06}>
            {STATS.map((s) => (
              <StaggerItem key={s.label}>
                <div className="rounded-xl border border-outline-variant/10 bg-surface-container/60 p-4">
                  <p className="text-headline-sm font-medium text-on-surface">{s.value}</p>
                  <p className="mt-0.5 text-body-sm text-on-surface-variant">{s.label}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <FadeIn>
          <p className="font-label-caps text-label-caps uppercase text-secondary">Capabilities</p>
          <h2 className="mt-2 max-w-2xl text-headline-sm font-medium tracking-tight text-on-surface lg:text-display-sm">
            Everything an operations team touches in a day
          </h2>
        </FadeIn>

        <Stagger className="mt-10 grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3" gap={0.04}>
          {FEATURES.map((f) => (
            <StaggerItem key={f.title}>
              <Pressable className="h-full">
                <div className="group h-full rounded-xl border border-outline-variant/10 bg-surface-container p-5 transition-colors hover:border-secondary-container/30">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-highest text-secondary transition-transform duration-300 group-hover:scale-110">
                    <Icon name={f.icon} size={20} />
                  </span>
                  <h3 className="mt-4 text-title-md font-medium text-on-surface">{f.title}</h3>
                  <p className="mt-1.5 text-body-sm leading-relaxed text-on-surface-variant">{f.body}</p>
                </div>
              </Pressable>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how" className="scroll-mt-20 border-y border-outline-variant/10 bg-surface-container-low/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <FadeIn>
            <p className="font-label-caps text-label-caps uppercase text-secondary">How it works</p>
            <h2 className="mt-2 text-headline-sm font-medium tracking-tight text-on-surface lg:text-display-sm">
              Three steps to a working back office
            </h2>
          </FadeIn>

          <Stagger className="mt-10 grid grid-cols-1 gap-gutter md:grid-cols-3" gap={0.08}>
            {[
              { n: '01', t: 'Sign in', b: 'Use a demo role or continue with Google. Sessions are JWT-based with the refresh token in an HttpOnly cookie.' },
              { n: '02', t: 'Run operations', b: 'Add customers, manage the catalogue, raise challans. Stock and the ledger update atomically on confirmation.' },
              { n: '03', t: 'Let the agent watch', b: 'It scans twice daily, records what needs attention, and emails a briefing ordered by value at risk.' },
            ].map((s) => (
              <StaggerItem key={s.n}>
                <div className="relative h-full rounded-xl border border-outline-variant/10 bg-surface-container p-6">
                  <span className="font-data-mono text-[2rem] font-medium leading-none text-secondary/25">
                    {s.n}
                  </span>
                  <h3 className="mt-3 text-title-md font-medium text-on-surface">{s.t}</h3>
                  <p className="mt-1.5 text-body-sm leading-relaxed text-on-surface-variant">{s.b}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Personas (clearly labelled as illustrative) ─────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <FadeIn>
          <p className="font-label-caps text-label-caps uppercase text-secondary">Who it's for</p>
          <h2 className="mt-2 text-headline-sm font-medium tracking-tight text-on-surface lg:text-display-sm">
            Built around four roles
          </h2>
          <p className="mt-3 max-w-2xl text-body-sm text-on-surface-variant">
            Illustrative examples of what each role gets out of the product — this is a demo
            application, so these are written to show intent, not quoted from customers.
          </p>
        </FadeIn>

        <Stagger className="mt-10 grid grid-cols-1 gap-gutter md:grid-cols-3" gap={0.07}>
          {PERSONAS.map((p) => (
            <StaggerItem key={p.role}>
              <figure className="flex h-full flex-col rounded-xl border border-outline-variant/10 bg-surface-container p-6">
                <Icon name="format_quote" size={26} className="text-secondary/40" />
                <blockquote className="mt-2 flex-1 text-body-sm leading-relaxed text-on-surface">
                  {p.quote}
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-outline-variant/10 pt-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-container/25 font-data-mono text-[11px] font-semibold text-secondary">
                    {p.initials}
                  </span>
                  <span className="text-body-sm text-on-surface-variant">{p.role}</span>
                </figcaption>
              </figure>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ── Stack ──────────────────────────────────────────────────────── */}
      <section className="border-y border-outline-variant/10 bg-surface-container-low/40">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <FadeIn>
            <p className="text-center font-label-caps text-label-caps uppercase text-on-surface-variant/70">
              Built with
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {STACK.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-outline-variant/15 bg-surface-container px-3 py-1.5 font-data-mono text-data-mono text-on-surface-variant"
                >
                  {t}
                </span>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
        <FadeIn>
          <h2 className="text-headline-sm font-medium tracking-tight text-on-surface lg:text-display-sm">
            Questions
          </h2>
        </FadeIn>
        <div className="mt-8 space-y-3">
          {FAQ.map((f, i) => (
            <FadeIn key={f.q} delay={0.05 * i}>
              <details className="group rounded-xl border border-outline-variant/10 bg-surface-container px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-body-md font-medium text-on-surface">
                  {f.q}
                  <Icon
                    name="expand_more"
                    size={20}
                    className="shrink-0 text-on-surface-variant transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <p className="mt-3 text-body-sm leading-relaxed text-on-surface-variant">{f.a}</p>
              </details>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <FadeIn>
          <div className="relative overflow-hidden rounded-2xl border border-secondary-container/25 bg-surface-container p-10 text-center">
            <div className="ai-glow pointer-events-none absolute inset-0" />
            <div className="relative">
              <h2 className="text-headline-sm font-medium tracking-tight text-on-surface">
                See it running on real data
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-body-sm text-on-surface-variant">
                503 customers, 306 products and 25,000 challans are already loaded. Sign in as any
                role and look around.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to={status === 'authenticated' ? '/' : '/login'}>
                  <Button size="md" icon="login" className="w-full sm:w-auto">
                    {status === 'authenticated' ? 'Open dashboard' : 'Sign in to the demo'}
                  </Button>
                </Link>
                <a
                  href="https://github.com/VEER-TARGARYEN/fundsroom-erp"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <Button variant="secondary" size="md" icon="code" className="w-full sm:w-auto">
                    Read the source
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      <footer className="border-t border-outline-variant/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-primary text-on-primary">
              <Icon name="deployed_code" size={16} />
            </span>
            <span className="text-body-sm text-on-surface-variant">
              Nexus Core · Fundsroom ERP
            </span>
          </div>
          <p className="text-body-sm text-on-surface-variant/60">
            A demonstration application. Not affiliated with any real company.
          </p>
        </div>
      </footer>
    </div>
  )
}
