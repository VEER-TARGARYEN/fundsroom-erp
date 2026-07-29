import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useStockLogs, type StockLogListParams } from '@/api/stockLogs.api'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { MOVEMENT } from '@/config/statusMeta'
import { cn, formatDateTime } from '@/lib/utils'
import type { MovementType } from '@/types/api'

export function InventoryPage() {
  const [search, setSearch] = useState('')
  const [movement, setMovement] = useState<MovementType | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const debounced = useDebouncedValue(search)

  useEffect(() => setPage(1), [debounced, movement])

  const query: StockLogListParams = {
    page,
    limit: 20,
    search: debounced || undefined,
    movementType: movement === 'ALL' ? undefined : movement,
  }
  const { data, isLoading, isError, error, refetch, isFetching } = useStockLogs(query)

  return (
    <>
      <PageHeader title="Inventory" subtitle="Immutable stock-movement ledger — every change is audited." />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU, product or reason…" className="pl-9" />
        </div>
        <Select value={movement} onChange={(e) => setMovement(e.target.value as typeof movement)} className="sm:w-56">
          <option value="ALL">All movement types</option>
          <option value="PURCHASE_IN">PURCHASE_IN</option>
          <option value="CHALLAN_OUT">CHALLAN_OUT</option>
          <option value="MANUAL_ADJUST">MANUAL_ADJUST</option>
        </Select>
        {isFetching && !isLoading && <Icon name="progress_activity" size={18} className="animate-spin text-on-surface-variant" />}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (data?.data.length ?? 0) === 0 ? (
          <EmptyState icon="swap_vert" title="No movements found" hint="Adjust the search or movement filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-low font-label-caps text-label-caps uppercase text-on-surface-variant">
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">SKU &amp; Product</th>
                  <th className="px-4 py-3 text-right font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Movement</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {data!.data.map((l) => {
                  const isIn = l.quantityChange >= 0
                  return (
                    <tr key={l.id} className="transition-colors hover:bg-surface-container-high">
                      <td className="px-4 py-3 font-mono text-data-mono text-on-surface-variant">{formatDateTime(l.createdAt)}</td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-data-mono text-on-surface">{l.product?.sku}</p>
                        <p className="text-body-sm text-on-surface-variant">{l.product?.name}</p>
                      </td>
                      <td className={cn('px-4 py-3 text-right font-mono text-body-sm', isIn ? 'text-success' : 'text-error')}>
                        {isIn ? '+' : '−'}
                        {Math.abs(l.quantityChange)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={MOVEMENT[l.movementType].tone}>{MOVEMENT[l.movementType].label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-body-sm text-on-surface-variant">{l.reason}</td>
                      <td className="px-4 py-3 text-body-sm text-on-surface-variant">{l.user?.name ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!isLoading && !isError && <Pagination meta={data?.pagination} onPage={setPage} />}
    </>
  )
}
