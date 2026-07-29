import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import { useAuth } from '@/features/auth/AuthContext'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/states'
import { cn, money, relativeTime } from '@/lib/utils'
import { CHALLAN_STATUS, MOVEMENT } from '@/config/statusMeta'
import type { Challan, Paginated, Product, StockLog } from '@/types/api'

function useTotal(resource: string, params: Record<string, unknown>, enabled: boolean) {
  return useQuery({
    queryKey: ['count', resource, params],
    queryFn: async () =>
      (await api.get<Paginated<unknown>>(`/${resource}`, { params: { ...params, limit: 1 } })).data
        .pagination.total,
    enabled,
  })
}

interface Kpi {
  label: string
  value: string
  icon: string
  caption?: string
  loading: boolean
  tone?: 'default' | 'error'
  to?: string
}

export function DashboardPage() {
  const { user } = useAuth()
  const role = user!.role
  const canCRM = ['ADMIN', 'SALES', 'ACCOUNTS'].includes(role)
  const canProducts = ['ADMIN', 'SALES', 'WAREHOUSE'].includes(role)
  const canLedger = ['ADMIN', 'WAREHOUSE'].includes(role)

  const totalCustomers = useTotal('customers', {}, canCRM)
  const activeCustomers = useTotal('customers', { status: 'ACTIVE' }, canCRM)
  const leads = useTotal('customers', { status: 'LEAD' }, canCRM)
  const lowStock = useTotal('products', { lowStock: 'true' }, canProducts)
  const draftChallans = useTotal('challans', { status: 'DRAFT' }, canCRM)

  const productSample = useQuery({
    queryKey: ['products', { limit: 100, forValue: true }],
    queryFn: async () =>
      (await api.get<Paginated<Product>>('/products', { params: { limit: 100 } })).data,
    enabled: canProducts,
  })
  const inventoryValue = (productSample.data?.data ?? []).reduce(
    (sum, p) => sum + Number.parseFloat(p.unitPrice) * p.stockQuantity,
    0,
  )

  const recentChallans = useQuery({
    queryKey: ['challans', { limit: 6, recent: true }],
    queryFn: async () =>
      (await api.get<Paginated<Challan>>('/challans', { params: { limit: 6 } })).data.data,
    enabled: canCRM,
  })
  const recentLogs = useQuery({
    queryKey: ['stock-logs', { limit: 6, recent: true }],
    queryFn: async () =>
      (await api.get<Paginated<StockLog>>('/stock-logs', { params: { limit: 6 } })).data.data,
    enabled: canLedger && !canCRM,
  })

  const kpis: Kpi[] = []
  if (canCRM) {
    kpis.push({ label: 'Total Customers', value: fmt(totalCustomers.data), icon: 'groups', loading: totalCustomers.isLoading, to: '/customers' })
    kpis.push({ label: 'Active Customers', value: fmt(activeCustomers.data), icon: 'person_check', caption: `${fmt(leads.data)} open leads`, loading: activeCustomers.isLoading, to: '/customers' })
    kpis.push({ label: 'Pending Challans', value: fmt(draftChallans.data), icon: 'pending_actions', caption: 'Awaiting confirmation', loading: draftChallans.isLoading, to: '/challans' })
  }
  if (canProducts) {
    kpis.push({ label: 'Inventory Value', value: productSample.data ? money(inventoryValue, true) : '—', icon: 'account_balance_wallet', caption: 'Across catalogue', loading: productSample.isLoading, to: '/products' })
    kpis.push({ label: 'Low Stock Alerts', value: fmt(lowStock.data), icon: 'warning', caption: 'At or below minimum', loading: lowStock.isLoading, tone: 'error', to: '/products' })
  }

  const insights = buildInsights({
    lowStock: lowStock.data,
    leads: leads.data,
    drafts: draftChallans.data,
  })

  return (
    <>
      <PageHeader
        title={`Good day, ${user!.name.split(' ')[0]}`}
        subtitle="Real-time overview across operations. Everything below is live from the API."
      />

      <section className="grid grid-cols-1 gap-gutter sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((k) => (
          <StatCard key={k.label} kpi={k} />
        ))}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-gutter lg:grid-cols-3">
        {/* Recent activity */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-title-md font-medium text-on-surface">Recent activity</h2>
            {canCRM && (
              <Link to="/challans" className="flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-on-surface">
                View all <Icon name="arrow_forward" size={16} />
              </Link>
            )}
          </div>
          <div className="p-2">
            {canCRM ? (
              recentChallans.isLoading ? (
                <ActivitySkeleton />
              ) : (recentChallans.data?.length ?? 0) === 0 ? (
                <p className="px-3 py-8 text-center text-body-sm text-on-surface-variant">No challans yet.</p>
              ) : (
                <ul className="divide-y divide-outline-variant/10">
                  {recentChallans.data!.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
                        <Icon name="receipt_long" size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-sm text-on-surface">
                          <span className="font-mono">{c.challanNumber}</span> · {c.customer?.businessName}
                        </p>
                        <p className="text-data-mono text-on-surface-variant">{relativeTime(c.createdAt)}</p>
                      </div>
                      <span className="font-mono text-body-sm text-on-surface">{money(c.totalAmount)}</span>
                      <Badge tone={CHALLAN_STATUS[c.status].tone} dot>
                        {CHALLAN_STATUS[c.status].label}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )
            ) : recentLogs.isLoading ? (
              <ActivitySkeleton />
            ) : (
              <ul className="divide-y divide-outline-variant/10">
                {(recentLogs.data ?? []).map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
                      <Icon name="swap_vert" size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm text-on-surface">
                        <span className="font-mono">{l.product?.sku}</span> · {l.reason}
                      </p>
                      <p className="text-data-mono text-on-surface-variant">{relativeTime(l.createdAt)}</p>
                    </div>
                    <span className={cn('font-mono text-body-sm', l.quantityChange >= 0 ? 'text-success' : 'text-error')}>
                      {l.quantityChange >= 0 ? '+' : '−'}
                      {Math.abs(l.quantityChange)}
                    </span>
                    <Badge tone={MOVEMENT[l.movementType].tone}>{MOVEMENT[l.movementType].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* AI insights (derived from live data) */}
        <Card className="relative overflow-hidden">
          <div className="ai-glow pointer-events-none absolute inset-0" />
          <div className="relative flex items-center gap-2 px-5 pt-5">
            <Icon name="auto_awesome" size={20} className="text-secondary" />
            <h2 className="text-title-md font-medium text-on-surface">Nexus Insights</h2>
          </div>
          <div className="relative space-y-3 p-5">
            {insights.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant">All clear — no attention items right now.</p>
            ) : (
              insights.map((ins, i) => (
                <div key={i} className="rounded-xl border border-secondary-container/20 bg-surface-container-low p-4">
                  <div className="flex items-start gap-3">
                    <Icon name={ins.icon} size={18} className="mt-0.5 text-secondary" />
                    <div>
                      <p className="text-body-sm font-medium text-on-surface">{ins.title}</p>
                      <p className="mt-0.5 text-body-sm text-on-surface-variant">{ins.body}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
            <p className="pt-1 text-center text-data-mono text-on-surface-variant/60">
              Derived from live metrics · generative AI backend pending
            </p>
          </div>
        </Card>
      </div>
    </>
  )
}

function StatCard({ kpi }: { kpi: Kpi }) {
  const body = (
    <Card className="group relative flex min-h-[132px] flex-col justify-between overflow-hidden p-5 transition-colors hover:border-outline-variant/25">
      <div className="flex items-start justify-between">
        <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">{kpi.label}</span>
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-highest',
            kpi.tone === 'error' ? 'text-error' : 'text-on-surface-variant',
          )}
        >
          <Icon name={kpi.icon} size={20} />
        </span>
      </div>
      {kpi.loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <p className="mt-2 text-headline-sm font-medium text-on-surface">{kpi.value}</p>
      )}
      {kpi.caption && <p className="mt-1 text-body-sm text-on-surface-variant">{kpi.caption}</p>}
    </Card>
  )
  return kpi.to ? <Link to={kpi.to}>{body}</Link> : body
}

function ActivitySkeleton() {
  return (
    <div className="space-y-2 p-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

function fmt(n?: number): string {
  return n === undefined ? '—' : new Intl.NumberFormat('en-IN').format(n)
}

function buildInsights(d: { lowStock?: number; leads?: number; drafts?: number }) {
  const out: { icon: string; title: string; body: string }[] = []
  if (d.lowStock) out.push({ icon: 'inventory_2', title: 'Restock soon', body: `${d.lowStock} product${d.lowStock === 1 ? '' : 's'} at or below minimum stock.` })
  if (d.drafts) out.push({ icon: 'pending_actions', title: 'Pending challans', body: `${d.drafts} draft challan${d.drafts === 1 ? '' : 's'} awaiting confirmation.` })
  if (d.leads) out.push({ icon: 'trending_up', title: 'Warm leads', body: `${d.leads} lead${d.leads === 1 ? '' : 's'} in the pipeline — schedule follow-ups.` })
  return out
}
