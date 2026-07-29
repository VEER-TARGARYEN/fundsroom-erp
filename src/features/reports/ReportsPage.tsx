import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuth } from '@/features/auth/AuthContext'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/states'
import { money, formatNumber } from '@/lib/utils'
import { CHALLAN_STATUS } from '@/config/statusMeta'
import type { Challan, Paginated, Product } from '@/types/api'

/** Trigger a client-side CSV download (no backend needed). */
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? '')
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface BarDatum {
  label: string
  value: number
  tone?: string
}

function BarList({ data, format }: { data: BarDatum[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  if (data.length === 0) {
    return <p className="px-1 py-6 text-center text-body-sm text-on-surface-variant">No data yet.</p>
  }
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-body-sm text-on-surface">{d.label}</span>
            <span className="shrink-0 font-mono text-body-sm text-on-surface-variant">
              {format ? format(d.value) : formatNumber(d.value)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className={d.tone ?? 'bg-secondary'}
              style={{ width: `${(d.value / max) * 100}%`, height: '100%' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ReportsPage() {
  const { user } = useAuth()
  const role = user!.role
  const canProducts = ['ADMIN', 'SALES', 'WAREHOUSE'].includes(role)
  const canCRM = ['ADMIN', 'SALES', 'ACCOUNTS'].includes(role)

  const productsQ = useQuery({
    queryKey: ['reports', 'products'],
    queryFn: async () =>
      (await api.get<Paginated<Product>>('/products', { params: { limit: 100 } })).data,
    enabled: canProducts,
  })

  const confirmedQ = useQuery({
    queryKey: ['reports', 'challans', 'CONFIRMED'],
    queryFn: async () =>
      (await api.get<Paginated<Challan>>('/challans', { params: { limit: 100, status: 'CONFIRMED' } }))
        .data,
    enabled: canCRM,
  })

  const draftCountQ = useQuery({
    queryKey: ['reports', 'count', 'DRAFT'],
    queryFn: async () =>
      (await api.get<Paginated<Challan>>('/challans', { params: { limit: 1, status: 'DRAFT' } })).data
        .pagination.total,
    enabled: canCRM,
  })
  const confirmedCountQ = useQuery({
    queryKey: ['reports', 'count', 'CONFIRMED'],
    queryFn: async () =>
      (await api.get<Paginated<Challan>>('/challans', { params: { limit: 1, status: 'CONFIRMED' } }))
        .data.pagination.total,
    enabled: canCRM,
  })
  const cancelledCountQ = useQuery({
    queryKey: ['reports', 'count', 'CANCELLED'],
    queryFn: async () =>
      (await api.get<Paginated<Challan>>('/challans', { params: { limit: 1, status: 'CANCELLED' } }))
        .data.pagination.total,
    enabled: canCRM,
  })

  const products = productsQ.data?.data ?? []
  const confirmed = confirmedQ.data?.data ?? []

  const inventoryValue = useMemo(
    () => products.reduce((s, p) => s + Number.parseFloat(p.unitPrice) * p.stockQuantity, 0),
    [products],
  )
  const salesValue = useMemo(
    () => confirmed.reduce((s, c) => s + Number.parseFloat(c.totalAmount), 0),
    [confirmed],
  )
  const lowStockCount = useMemo(
    () => products.filter((p) => p.stockQuantity <= p.minStock).length,
    [products],
  )
  const avgOrder = confirmed.length ? salesValue / confirmed.length : 0

  const byCategory = useMemo<BarDatum[]>(() => {
    const map = new Map<string, number>()
    for (const p of products) {
      map.set(p.category, (map.get(p.category) ?? 0) + Number.parseFloat(p.unitPrice) * p.stockQuantity)
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
  }, [products])

  const topProducts = useMemo<BarDatum[]>(
    () =>
      [...products]
        .map((p) => ({ label: p.name, value: Number.parseFloat(p.unitPrice) * p.stockQuantity }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
    [products],
  )

  const topCustomers = useMemo<BarDatum[]>(() => {
    const map = new Map<string, number>()
    for (const c of confirmed) {
      const name = c.customer?.businessName ?? 'Unknown'
      map.set(name, (map.get(name) ?? 0) + Number.parseFloat(c.totalAmount))
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }, [confirmed])

  const statusBars = useMemo<BarDatum[]>(
    () => [
      { label: CHALLAN_STATUS.CONFIRMED.label, value: confirmedCountQ.data ?? 0, tone: 'bg-success' },
      { label: CHALLAN_STATUS.DRAFT.label, value: draftCountQ.data ?? 0, tone: 'bg-secondary' },
      { label: CHALLAN_STATUS.CANCELLED.label, value: cancelledCountQ.data ?? 0, tone: 'bg-error' },
    ],
    [confirmedCountQ.data, draftCountQ.data, cancelledCountQ.data],
  )

  function exportProducts() {
    downloadCsv(
      'fundsroom-products.csv',
      [
        ['SKU', 'Name', 'Category', 'Unit Price', 'Stock', 'Min Stock', 'Stock Value', 'Warehouse'],
        ...products.map((p) => [
          p.sku,
          p.name,
          p.category,
          p.unitPrice,
          p.stockQuantity,
          p.minStock,
          (Number.parseFloat(p.unitPrice) * p.stockQuantity).toFixed(2),
          p.warehouseLocation,
        ]),
      ],
    )
  }

  function exportChallans() {
    downloadCsv(
      'fundsroom-sales.csv',
      [
        ['Challan No.', 'Customer', 'Subtotal', 'Tax', 'Total', 'Confirmed At'],
        ...confirmed.map((c) => [
          c.challanNumber,
          c.customer?.businessName ?? '',
          c.subtotal,
          c.taxAmount,
          c.totalAmount,
          c.confirmedAt ?? '',
        ]),
      ],
    )
  }

  const loading =
    (canProducts && productsQ.isLoading) || (canCRM && confirmedQ.isLoading)

  const kpis = [
    canCRM && { label: 'Sales Value', value: money(salesValue, true), icon: 'payments', caption: 'Confirmed challans' },
    canCRM && { label: 'Confirmed Orders', value: formatNumber(confirmedCountQ.data ?? 0), icon: 'receipt_long', caption: `Avg ${money(avgOrder, true)}` },
    canProducts && { label: 'Inventory Value', value: money(inventoryValue, true), icon: 'inventory_2', caption: 'Across catalogue' },
    canProducts && { label: 'Low Stock SKUs', value: formatNumber(lowStockCount), icon: 'warning', caption: 'At or below minimum' },
  ].filter(Boolean) as { label: string; value: string; icon: string; caption: string }[]

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Live sales and inventory analytics, computed from the operational database."
        actions={
          <>
            {canProducts && (
              <Button variant="secondary" size="sm" icon="download" onClick={exportProducts} disabled={loading}>
                Products CSV
              </Button>
            )}
            {canCRM && (
              <Button variant="secondary" size="sm" icon="download" onClick={exportChallans} disabled={loading}>
                Sales CSV
              </Button>
            )}
          </>
        }
      />

      <section className="grid grid-cols-1 gap-gutter sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="flex min-h-[124px] flex-col justify-between p-5">
            <div className="flex items-start justify-between">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">{k.label}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-highest text-on-surface-variant">
                <Icon name={k.icon} size={20} />
              </span>
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-24" />
            ) : (
              <p className="mt-2 text-headline-sm font-medium text-on-surface">{k.value}</p>
            )}
            <p className="mt-1 text-body-sm text-on-surface-variant">{k.caption}</p>
          </Card>
        ))}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-gutter lg:grid-cols-2">
        {canProducts && (
          <Card className="p-5">
            <h2 className="mb-4 text-title-md font-medium text-on-surface">Inventory value by category</h2>
            {productsQ.isLoading ? <ChartSkeleton /> : <BarList data={byCategory} format={(n) => money(n, true)} />}
          </Card>
        )}

        {canCRM && (
          <Card className="p-5">
            <h2 className="mb-4 text-title-md font-medium text-on-surface">Challans by status</h2>
            <BarList data={statusBars} format={formatNumber} />
          </Card>
        )}

        {canProducts && (
          <Card className="p-5">
            <h2 className="mb-4 text-title-md font-medium text-on-surface">Top products by stock value</h2>
            {productsQ.isLoading ? <ChartSkeleton /> : <BarList data={topProducts} format={(n) => money(n, true)} />}
          </Card>
        )}

        {canCRM && (
          <Card className="p-5">
            <h2 className="mb-4 text-title-md font-medium text-on-surface">Top customers by sales</h2>
            {confirmedQ.isLoading ? (
              <ChartSkeleton />
            ) : (
              <BarList data={topCustomers} format={(n) => money(n, true)} />
            )}
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
