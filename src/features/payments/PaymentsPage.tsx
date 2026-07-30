import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import {
  useReceivables,
  useOpenInvoices,
  usePayments,
  PAYMENT_METHOD_LABEL,
  type AgingBucket,
} from '@/api/payments.api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton, EmptyState, LoadingState, ErrorState } from '@/components/ui/states'
import { CountUp } from '@/components/ui/CountUp'
import { Stagger, StaggerItem, m } from '@/components/motion'
import { money, formatDate, formatNumber, cn } from '@/lib/utils'
import { RecordPaymentDialog } from './RecordPaymentDialog'

/** Aging severity — the further right, the worse. */
const BUCKET_TONE: Record<string, { bar: string; text: string }> = {
  current: { bar: 'bg-success', text: 'text-success' },
  b31_60: { bar: 'bg-secondary', text: 'text-secondary' },
  b61_90: { bar: 'bg-warning', text: 'text-warning' },
  b90plus: { bar: 'bg-error', text: 'text-error' },
}

function ageTone(days: number) {
  if (days > 90) return 'error' as const
  if (days > 60) return 'warning' as const
  if (days > 30) return 'indigo' as const
  return 'success' as const
}

function AgingChart({ buckets }: { buckets: AgingBucket[] }) {
  const values = buckets.map((b) => Number.parseFloat(b.outstanding) || 0)
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) {
    return <p className="py-6 text-center text-body-sm text-on-surface-variant">Nothing outstanding.</p>
  }
  return (
    <div className="space-y-3">
      {/* Proportional stacked bar — the shape of the receivable at a glance. */}
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-container-highest">
        {buckets.map((b, i) => (
          <m.div
            key={b.key}
            className={cn('h-full first:rounded-l-full last:rounded-r-full', BUCKET_TONE[b.key]?.bar)}
            style={{ width: `${(values[i]! / total) * 100}%` }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>

      <table className="w-full text-body-sm">
        <tbody>
          {buckets.map((b, i) => (
            <tr key={b.key}>
              <td className="py-1.5">
                <span className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', BUCKET_TONE[b.key]?.bar)} />
                  <span className="text-on-surface">{b.label}</span>
                </span>
              </td>
              <td className="py-1.5 text-right font-mono text-on-surface-variant">
                {formatNumber(b.invoices)}
              </td>
              <td className={cn('py-1.5 text-right font-mono font-medium', BUCKET_TONE[b.key]?.text)}>
                {money(b.outstanding, true)}
              </td>
              <td className="py-1.5 pl-3 text-right font-data-mono text-data-mono text-on-surface-variant/70">
                {total > 0 ? `${Math.round((values[i]! / total) * 100)}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PaymentsPage() {
  const { user } = useAuth()
  const canRecord = user?.role === 'ADMIN' || user?.role === 'ACCOUNTS'

  const [tab, setTab] = useState<'outstanding' | 'receipts'>('outstanding')
  const [page, setPage] = useState(1)
  const [payFor, setPayFor] = useState<string | null>(null)

  const rec = useReceivables()
  const open = useOpenInvoices({ page, limit: 20 })
  const receipts = usePayments({ page, limit: 20 })

  const int = (n: number) => formatNumber(Math.round(n))
  const inr = (n: number) => money(n, true)

  const kpis = [
    {
      label: 'Total outstanding',
      value: Number.parseFloat(rec.data?.aging.totalOutstanding ?? '0'),
      format: inr,
      icon: 'account_balance',
      caption: `${formatNumber(open.data?.pagination.total ?? 0)} open invoices`,
    },
    {
      label: 'Overdue (30+ days)',
      value: Number.parseFloat(rec.data?.aging.overdue ?? '0'),
      format: inr,
      icon: 'running_with_errors',
      caption: 'Past payment terms',
      tone: 'error' as const,
    },
    {
      label: 'Collected this month',
      value: Number.parseFloat(rec.data?.stats.collectedThisMonth ?? '0'),
      format: inr,
      icon: 'payments',
      caption: `${formatNumber(rec.data?.stats.receiptsThisMonth ?? 0)} receipts`,
    },
    {
      label: 'Avg days to pay',
      value: rec.data?.stats.avgDaysToPay ?? 0,
      format: int,
      icon: 'schedule',
      caption: 'Invoice to full settlement',
    },
  ]

  function switchTab(t: 'outstanding' | 'receipts') {
    setTab(t)
    setPage(1)
  }

  if (rec.isError) {
    return (
      <>
        <PageHeader title="Receivables" />
        <Card>
          <ErrorState error={rec.error} onRetry={() => void rec.refetch()} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Receivables"
        subtitle="Outstanding balances, aging and receipts — derived from confirmed challans."
      />

      <Stagger className="grid grid-cols-1 gap-gutter sm:grid-cols-2 xl:grid-cols-4">
        {rec.isLoading
          ? [0, 1, 2, 3].map((i) => (
              <Card key={i} className="flex min-h-[124px] flex-col justify-between p-5">
                <div className="flex items-start justify-between">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-9 w-9 rounded-lg" />
                </div>
                <Skeleton className="mt-3 h-8 w-24" />
                <Skeleton className="mt-1 h-3 w-20" />
              </Card>
            ))
          : kpis.map((k) => (
              <StaggerItem key={k.label}>
                <Card className="flex h-full min-h-[124px] flex-col justify-between p-5">
                  <div className="flex items-start justify-between">
                    <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                      {k.label}
                    </span>
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-highest',
                        k.tone === 'error' ? 'text-error' : 'text-on-surface-variant',
                      )}
                    >
                      <Icon name={k.icon} size={20} />
                    </span>
                  </div>
                  <CountUp
                    value={k.value}
                    format={k.format}
                    className="mt-2 text-headline-sm font-medium text-on-surface"
                  />
                  <p className="mt-1 text-body-sm text-on-surface-variant">{k.caption}</p>
                </Card>
              </StaggerItem>
            ))}
      </Stagger>

      <div className="mt-6 grid grid-cols-1 gap-gutter lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-title-md font-medium text-on-surface">Aging</h2>
          {rec.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-2.5 w-full rounded-full" />
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : (
            <AgingChart buckets={rec.data?.aging.buckets ?? []} />
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-title-md font-medium text-on-surface">Top debtors</h2>
          {rec.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : (rec.data?.topCustomers.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-body-sm text-on-surface-variant">
              No outstanding balances.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {rec.data!.topCustomers.map((c) => (
                <li key={c.customerId} className="flex items-center gap-3 text-body-sm">
                  <span className="min-w-0 flex-1 truncate text-on-surface">{c.businessName}</span>
                  <Badge tone={ageTone(c.oldestDays)}>{c.oldestDays}d</Badge>
                  <span className="w-24 shrink-0 text-right font-mono text-on-surface-variant">
                    {money(c.outstanding, true)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Worklist */}
      <div className="mt-6 mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ['outstanding', 'Open invoices'],
            ['receipts', 'Receipt history'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-body-sm font-medium transition-colors',
              tab === key
                ? 'bg-surface-container-highest text-on-surface'
                : 'text-on-surface-variant hover:bg-surface-container-high',
            )}
          >
            {label}
          </button>
        ))}
        {!canRecord && (
          <span className="ml-auto text-body-sm text-on-surface-variant">
            Your role can view the ledger but not record receipts.
          </span>
        )}
      </div>

      <Card className="overflow-hidden">
        {tab === 'outstanding' ? (
          open.isLoading ? (
            <LoadingState label="Loading open invoices…" />
          ) : (open.data?.data.length ?? 0) === 0 ? (
            <EmptyState icon="task_alt" title="Nothing outstanding" hint="Every confirmed challan is settled." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-body-sm">
                <thead className="border-b border-outline-variant/10 bg-surface-container-low">
                  <tr className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                    <th className="px-4 py-2.5 text-left">Invoice</th>
                    <th className="px-4 py-2.5 text-left">Customer</th>
                    <th className="px-4 py-2.5 text-left">Date</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5 text-right">Paid</th>
                    <th className="px-4 py-2.5 text-right">Due</th>
                    <th className="px-4 py-2.5 text-center">Age</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {open.data!.data.map((r) => (
                    <tr key={r.challanId} className="transition-colors hover:bg-surface-container-high">
                      <td className="px-4 py-3 font-mono text-data-mono text-on-surface">
                        {r.challanNumber}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-on-surface">
                        {r.businessName}
                      </td>
                      <td className="px-4 py-3 font-data-mono text-data-mono text-on-surface-variant">
                        {formatDate(r.confirmedAt)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-on-surface-variant">
                        {money(r.total)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-on-surface-variant">
                        {Number.parseFloat(r.paid) > 0 ? money(r.paid) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-on-surface">
                        {money(r.due)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge tone={ageTone(r.ageDays)}>{r.ageDays}d</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Link
                            to={`/challans/${r.challanId}/print`}
                            title="Print invoice"
                            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-secondary"
                          >
                            <Icon name="print" size={18} />
                          </Link>
                          {canRecord && (
                            <button
                              onClick={() => setPayFor(r.challanId)}
                              title="Record payment"
                              className="rounded-lg p-1.5 text-on-surface-variant hover:bg-success/10 hover:text-success"
                            >
                              <Icon name="payments" size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : receipts.isLoading ? (
          <LoadingState label="Loading receipts…" />
        ) : (receipts.data?.data.length ?? 0) === 0 ? (
          <EmptyState icon="receipt" title="No receipts yet" hint="Recorded payments will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-body-sm">
              <thead className="border-b border-outline-variant/10 bg-surface-container-low">
                <tr className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Invoice</th>
                  <th className="px-4 py-2.5 text-left">Customer</th>
                  <th className="px-4 py-2.5 text-left">Method</th>
                  <th className="px-4 py-2.5 text-left">Reference</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {receipts.data!.data.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-surface-container-high">
                    <td className="px-4 py-3 font-data-mono text-data-mono text-on-surface-variant">
                      {formatDate(p.paidAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-data-mono text-on-surface">
                      {p.challan?.challanNumber ?? '—'}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-on-surface">
                      {p.customer?.businessName ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{PAYMENT_METHOD_LABEL[p.method]}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-data-mono text-on-surface-variant">
                      {p.reference ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-success">
                      {money(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination
        meta={tab === 'outstanding' ? open.data?.pagination : receipts.data?.pagination}
        onPage={setPage}
      />

      <RecordPaymentDialog challanId={payFor} open={payFor !== null} onClose={() => setPayFor(null)} />
    </>
  )
}
