import { useState } from 'react'
import { api } from '@/api/client'
import { useReportsSummary, type ReportBucket } from '@/api/reports.api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Skeleton, ErrorState } from '@/components/ui/states'
import { money, formatNumber } from '@/lib/utils'
import { CHALLAN_STATUS } from '@/config/statusMeta'

/**
 * Streams a CSV built server-side. Going through axios (rather than a plain
 * link) keeps the Authorization header attached; the response is a Blob we
 * hand to a temporary anchor.
 */
async function downloadCsv(path: string, filename: string) {
  const res = await api.get<Blob>(path, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function BarList({
  data,
  format,
}: {
  data: ReportBucket[]
  format: (v: string) => string
}) {
  const values = data.map((d) => Number.parseFloat(d.value) || 0)
  const max = Math.max(1, ...values)
  if (data.length === 0) {
    return <p className="px-1 py-6 text-center text-body-sm text-on-surface-variant">No data yet.</p>
  }
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-body-sm text-on-surface">{d.label}</span>
            <span className="shrink-0 font-mono text-body-sm text-on-surface-variant">
              {format(d.value)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className="h-full rounded-full bg-secondary transition-[width] duration-700 ease-out"
              style={{ width: `${(values[i]! / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ReportsPage() {
  const { data, isLoading, isError, error, refetch } = useReportsSummary()
  const [busy, setBusy] = useState<'products' | 'sales' | null>(null)

  async function run(kind: 'products' | 'sales') {
    setBusy(kind)
    try {
      await downloadCsv(
        kind === 'products' ? '/reports/products.csv' : '/reports/sales.csv',
        kind === 'products' ? 'fundsroom-products.csv' : 'fundsroom-sales.csv',
      )
    } finally {
      setBusy(null)
    }
  }

  if (isError) {
    return (
      <>
        <PageHeader title="Reports & Analytics" />
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      </>
    )
  }

  const p = data?.products
  const s = data?.sales
  const avgOrder = s && s.confirmed > 0 ? Number.parseFloat(s.value) / s.confirmed : 0

  const kpis = [
    s && { label: 'Sales Value', value: money(s.value, true), icon: 'payments', caption: 'Confirmed challans' },
    s && {
      label: 'Confirmed Orders',
      value: formatNumber(s.confirmed),
      icon: 'receipt_long',
      caption: `Avg ${money(avgOrder, true)}`,
    },
    p && { label: 'Inventory Value', value: money(p.inventoryValue, true), icon: 'inventory_2', caption: `${formatNumber(p.total)} SKUs` },
    p && { label: 'Low Stock SKUs', value: formatNumber(p.lowStock), icon: 'warning', caption: 'At or below minimum' },
  ].filter(Boolean) as { label: string; value: string; icon: string; caption: string }[]

  const statusBars: ReportBucket[] = s
    ? [
        { label: CHALLAN_STATUS.CONFIRMED.label, value: String(s.confirmed) },
        { label: CHALLAN_STATUS.DRAFT.label, value: String(s.draft) },
        { label: CHALLAN_STATUS.CANCELLED.label, value: String(s.cancelled) },
      ]
    : []

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Aggregated in the database across every row — not a sample."
        actions={
          <>
            {p && (
              <Button
                variant="secondary"
                size="sm"
                icon="download"
                loading={busy === 'products'}
                disabled={isLoading || busy !== null}
                onClick={() => void run('products')}
              >
                Products CSV
              </Button>
            )}
            {s && (
              <Button
                variant="secondary"
                size="sm"
                icon="download"
                loading={busy === 'sales'}
                disabled={isLoading || busy !== null}
                onClick={() => void run('sales')}
              >
                Sales CSV
              </Button>
            )}
          </>
        }
      />

      <section className="grid grid-cols-1 gap-gutter sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? [0, 1, 2, 3].map((i) => (
              <Card key={i} className="flex min-h-[124px] flex-col justify-between p-5">
                <div className="flex items-start justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-9 rounded-lg" />
                </div>
                <Skeleton className="mt-3 h-8 w-24" />
                <Skeleton className="mt-1 h-3 w-20" />
              </Card>
            ))
          : kpis.map((k) => (
              <Card key={k.label} className="flex min-h-[124px] flex-col justify-between p-5">
                <div className="flex items-start justify-between">
                  <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">{k.label}</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-highest text-on-surface-variant">
                    <Icon name={k.icon} size={20} />
                  </span>
                </div>
                <p className="mt-2 text-headline-sm font-medium text-on-surface">{k.value}</p>
                <p className="mt-1 text-body-sm text-on-surface-variant">{k.caption}</p>
              </Card>
            ))}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-gutter lg:grid-cols-2">
        {p && (
          <Card className="p-5">
            <h2 className="mb-4 text-title-md font-medium text-on-surface">Inventory value by category</h2>
            {isLoading ? <ChartSkeleton /> : <BarList data={p.byCategory} format={(v) => money(v, true)} />}
          </Card>
        )}
        {s && (
          <Card className="p-5">
            <h2 className="mb-4 text-title-md font-medium text-on-surface">Challans by status</h2>
            {isLoading ? <ChartSkeleton /> : <BarList data={statusBars} format={(v) => formatNumber(Number(v))} />}
          </Card>
        )}
        {p && (
          <Card className="p-5">
            <h2 className="mb-4 text-title-md font-medium text-on-surface">Top products by stock value</h2>
            {isLoading ? <ChartSkeleton /> : <BarList data={p.topByStockValue} format={(v) => money(v, true)} />}
          </Card>
        )}
        {s && (
          <Card className="p-5">
            <h2 className="mb-4 text-title-md font-medium text-on-surface">Top customers by sales</h2>
            {isLoading ? <ChartSkeleton /> : <BarList data={s.topCustomers} format={(v) => money(v, true)} />}
          </Card>
        )}
      </div>
    </>
  )
}

function ChartSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}
