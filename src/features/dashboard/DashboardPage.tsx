import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { useDashboardSummary } from '@/api/dashboard.api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/Badge'
import { Skeleton, ErrorState } from '@/components/ui/states'
import { cn, money, relativeTime, formatNumber } from '@/lib/utils'
import { CHALLAN_STATUS, MOVEMENT } from '@/config/statusMeta'

interface Kpi {
  label: string
  value: string
  icon: string
  caption?: string
  tone?: 'default' | 'error'
  to?: string
}

export function DashboardPage() {
  const { user } = useAuth()
  const { data, isLoading, isError, error, refetch } = useDashboardSummary()

  if (isError) {
    return (
      <>
        <PageHeader title={`Good day, ${user!.name.split(' ')[0]}`} />
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      </>
    )
  }

  const kpis: Kpi[] = []
  if (data?.customers) {
    kpis.push({ label: 'Total Customers', value: formatNumber(data.customers.total), icon: 'groups', to: '/customers' })
    kpis.push({
      label: 'Active Customers',
      value: formatNumber(data.customers.active),
      icon: 'person_check',
      caption: `${formatNumber(data.customers.leads)} open leads`,
      to: '/customers',
    })
  }
  if (data?.challans) {
    kpis.push({
      label: 'Pending Challans',
      value: formatNumber(data.challans.draft),
      icon: 'pending_actions',
      caption: 'Awaiting confirmation',
      to: '/challans',
    })
  }
  if (data?.products) {
    kpis.push({
      label: 'Inventory Value',
      value: money(data.products.inventoryValue, true),
      icon: 'account_balance_wallet',
      caption: 'Across catalogue',
      to: '/products',
    })
    kpis.push({
      label: 'Low Stock Alerts',
      value: formatNumber(data.products.lowStock),
      icon: 'warning',
      caption: 'At or below minimum',
      tone: 'error',
      to: '/products',
    })
  }

  const insights = buildInsights({
    lowStock: data?.products?.lowStock,
    leads: data?.customers?.leads,
    drafts: data?.challans?.draft,
  })

  // WAREHOUSE has no challan visibility, so it sees the movement ledger instead.
  const showLedger = data?.recentChallans === null && data?.recentStockLogs !== null

  return (
    <>
      <PageHeader
        title={`Good day, ${user!.name.split(' ')[0]}`}
        subtitle="Real-time overview across operations. Everything below is live from the API."
      />

      <section className="grid grid-cols-1 gap-gutter sm:grid-cols-2 xl:grid-cols-3">
        {isLoading
          ? [0, 1, 2, 3, 4].map((i) => <KpiSkeleton key={i} />)
          : kpis.map((k) => <StatCard key={k.label} kpi={k} />)}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-gutter lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-title-md font-medium text-on-surface">Recent activity</h2>
            {!showLedger && data?.recentChallans && (
              <Link to="/challans" className="flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-on-surface">
                View all <Icon name="arrow_forward" size={16} />
              </Link>
            )}
          </div>
          <div className="p-2">
            {isLoading ? (
              <ActivitySkeleton />
            ) : showLedger ? (
              (data?.recentStockLogs?.length ?? 0) === 0 ? (
                <EmptyRow text="No stock movements yet." />
              ) : (
                <ul className="divide-y divide-outline-variant/10">
                  {data!.recentStockLogs!.map((l) => (
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
              )
            ) : (data?.recentChallans?.length ?? 0) === 0 ? (
              <EmptyRow text="No challans yet." />
            ) : (
              <ul className="divide-y divide-outline-variant/10">
                {data!.recentChallans!.map((c) => (
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
            )}
          </div>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="ai-glow pointer-events-none absolute inset-0" />
          <div className="relative flex items-center gap-2 px-5 pt-5">
            <Icon name="auto_awesome" size={20} className="text-secondary" />
            <h2 className="text-title-md font-medium text-on-surface">Nexus Insights</h2>
          </div>
          <div className="relative space-y-3 p-5">
            {isLoading ? (
              <>
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </>
            ) : insights.length === 0 ? (
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
            <Link
              to="/ai"
              className="flex items-center justify-center gap-1.5 pt-1 text-body-sm text-secondary hover:underline"
            >
              Ask the AI assistant <Icon name="arrow_forward" size={14} />
            </Link>
          </div>
        </Card>
      </div>
    </>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-3 py-8 text-center text-body-sm text-on-surface-variant">{text}</p>
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
      <p className="mt-2 text-headline-sm font-medium text-on-surface">{kpi.value}</p>
      {kpi.caption && <p className="mt-1 text-body-sm text-on-surface-variant">{kpi.caption}</p>}
    </Card>
  )
  return kpi.to ? <Link to={kpi.to}>{body}</Link> : body
}

function KpiSkeleton() {
  return (
    <Card className="flex min-h-[132px] flex-col justify-between p-5">
      <div className="flex items-start justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-8 w-24" />
      <Skeleton className="mt-1 h-3 w-20" />
    </Card>
  )
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

function buildInsights(d: { lowStock?: number; leads?: number; drafts?: number }) {
  const out: { icon: string; title: string; body: string }[] = []
  if (d.lowStock) out.push({ icon: 'inventory_2', title: 'Restock soon', body: `${d.lowStock} product${d.lowStock === 1 ? '' : 's'} at or below minimum stock.` })
  if (d.drafts) out.push({ icon: 'pending_actions', title: 'Pending challans', body: `${d.drafts} draft challan${d.drafts === 1 ? '' : 's'} awaiting confirmation.` })
  if (d.leads) out.push({ icon: 'trending_up', title: 'Warm leads', body: `${d.leads} lead${d.leads === 1 ? '' : 's'} in the pipeline — schedule follow-ups.` })
  return out
}
