import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import {
  usePurchaseOrders,
  usePurchasingStats,
  useOutstandingOnOrder,
  useSendPurchaseOrder,
  useCancelPurchaseOrder,
  PO_STATUS_META,
  type PurchaseOrderStatus,
} from '@/api/purchasing.api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton, EmptyState, LoadingState, ErrorState } from '@/components/ui/states'
import { CountUp } from '@/components/ui/CountUp'
import { Stagger, StaggerItem } from '@/components/motion'
import { useToast } from '@/components/feedback/ToastContext'
import { mapApiError } from '@/lib/errors'
import { money, formatDate, formatNumber, cn } from '@/lib/utils'
import { PurchaseOrderBuilder } from './PurchaseOrderBuilder'
import { ReceiveGoodsDialog } from './ReceiveGoodsDialog'

const STATUS_FILTERS: { key: PurchaseOrderStatus | 'ALL' | 'OVERDUE'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SENT', label: 'Sent' },
  { key: 'PARTIALLY_RECEIVED', label: 'Part received' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'RECEIVED', label: 'Received' },
]

export function PurchaseOrdersPage() {
  const { user } = useAuth()
  const canManage = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE'

  const [filter, setFilter] = useState<PurchaseOrderStatus | 'ALL' | 'OVERDUE'>('ALL')
  const [page, setPage] = useState(1)
  const [building, setBuilding] = useState(false)
  const [receiveFor, setReceiveFor] = useState<string | null>(null)
  const [pending, setPending] = useState<{ kind: 'send' | 'cancel'; id: string; label: string } | null>(
    null,
  )

  const list = usePurchaseOrders({
    page,
    limit: 20,
    status: filter === 'ALL' || filter === 'OVERDUE' ? undefined : filter,
    overdue: filter === 'OVERDUE' ? true : undefined,
  })
  const stats = usePurchasingStats()
  const inbound = useOutstandingOnOrder(true)
  const send = useSendPurchaseOrder()
  const cancel = useCancelPurchaseOrder()
  const toast = useToast()

  const int = (n: number) => formatNumber(Math.round(n))
  const inr = (n: number) => money(n, true)

  const kpis = [
    {
      label: 'Open orders',
      value: stats.data?.openOrders ?? 0,
      format: int,
      icon: 'local_shipping',
      caption: 'Sent or part received',
    },
    {
      label: 'Value on order',
      value: Number.parseFloat(stats.data?.openValue ?? '0'),
      format: inr,
      icon: 'account_balance_wallet',
      caption: 'Committed to suppliers',
    },
    {
      label: 'Overdue',
      value: stats.data?.overdueOrders ?? 0,
      format: int,
      icon: 'schedule',
      caption: 'Past expected delivery',
      tone: 'error' as const,
    },
    {
      label: 'Drafts',
      value: stats.data?.counts.DRAFT ?? 0,
      format: int,
      icon: 'edit_note',
      caption: 'Not yet sent',
    },
  ]

  function switchFilter(k: typeof filter) {
    setFilter(k)
    setPage(1)
  }

  async function runPending() {
    if (!pending) return
    try {
      if (pending.kind === 'send') {
        await send.mutateAsync(pending.id)
        toast.push({ tone: 'success', title: `${pending.label} sent to supplier` })
      } else {
        await cancel.mutateAsync(pending.id)
        toast.push({ tone: 'info', title: `${pending.label} cancelled` })
      }
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not complete', description: mapApiError(err) })
    } finally {
      setPending(null)
    }
  }

  if (list.isError) {
    return (
      <>
        <PageHeader title="Purchase Orders" />
        <Card>
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Order stock from suppliers and receive it into the warehouse."
        actions={
          canManage && (
            <Button icon="add_shopping_cart" onClick={() => setBuilding(true)}>
              New order
            </Button>
          )
        }
      />

      <Stagger className="grid grid-cols-1 gap-gutter sm:grid-cols-2 xl:grid-cols-4">
        {stats.isLoading
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

      {/* The reorder question: low on stock AND nothing inbound is the real signal. */}
      {(inbound.data?.length ?? 0) > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="mb-1 text-title-md font-medium text-on-surface">
            Low stock with goods already inbound
          </h2>
          <p className="mb-4 text-body-sm text-on-surface-variant">
            These SKUs are at or below minimum, but stock is already on order — they don't need
            re-ordering yet.
          </p>
          <ul className="space-y-1.5">
            {inbound.data!.slice(0, 6).map((p) => (
              <li key={p.productId} className="flex items-center gap-3 text-body-sm">
                <span className="min-w-0 flex-1 truncate text-on-surface">{p.name}</span>
                <span className="font-mono text-data-mono text-on-surface-variant">{p.sku}</span>
                <Badge tone="warning">
                  {p.stockQuantity}/{p.minStock}
                </Badge>
                <span className="w-24 shrink-0 text-right font-mono text-success">
                  +{formatNumber(p.onOrder)} inbound
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-4 mt-6 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => switchFilter(f.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-body-sm font-medium transition-colors',
              filter === f.key
                ? 'bg-surface-container-highest text-on-surface'
                : 'text-on-surface-variant hover:bg-surface-container-high',
            )}
          >
            {f.label}
          </button>
        ))}
        {!canManage && (
          <span className="ml-auto text-body-sm text-on-surface-variant">
            Your role can view orders but not raise or receive them.
          </span>
        )}
      </div>

      <Card className="overflow-hidden">
        {list.isLoading ? (
          <LoadingState label="Loading purchase orders…" />
        ) : (list.data?.data.length ?? 0) === 0 ? (
          <EmptyState
            icon="local_shipping"
            title="No purchase orders"
            hint={
              canManage
                ? 'Raise one to order stock from a supplier.'
                : 'Nothing to show for this filter.'
            }
            action={
              canManage ? (
                <Button variant="secondary" size="sm" icon="add_shopping_cart" onClick={() => setBuilding(true)}>
                  New order
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-body-sm">
              <thead className="border-b border-outline-variant/10 bg-surface-container-low">
                <tr className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  <th className="px-4 py-2.5 text-left">PO</th>
                  <th className="px-4 py-2.5 text-left">Supplier</th>
                  <th className="px-4 py-2.5 text-left">Raised</th>
                  <th className="px-4 py-2.5 text-left">Expected</th>
                  <th className="px-4 py-2.5 text-right">Lines</th>
                  <th className="px-4 py-2.5 text-right">Value</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {list.data!.data.map((po) => {
                  const overdue =
                    po.expectedDate !== null &&
                    new Date(po.expectedDate) < new Date() &&
                    (po.status === 'SENT' || po.status === 'PARTIALLY_RECEIVED')
                  const meta = PO_STATUS_META[po.status]
                  return (
                    <tr key={po.id} className="transition-colors hover:bg-surface-container-high">
                      <td className="px-4 py-3 font-mono text-data-mono text-on-surface">
                        {po.poNumber}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-on-surface">
                        {po.supplier?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-data-mono text-data-mono text-on-surface-variant">
                        {formatDate(po.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-data-mono text-data-mono">
                        <span className={overdue ? 'text-error' : 'text-on-surface-variant'}>
                          {po.expectedDate ? formatDate(po.expectedDate) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-on-surface-variant">
                        {po._count?.items ?? po.items?.length ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-on-surface">
                        {money(po.totalAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Badge tone={meta.tone} dot>
                            {meta.label}
                          </Badge>
                          {overdue && <Badge tone="error">Overdue</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {canManage && po.status === 'DRAFT' && (
                            <button
                              onClick={() => setPending({ kind: 'send', id: po.id, label: po.poNumber })}
                              title="Send to supplier"
                              className="rounded-lg p-1.5 text-on-surface-variant hover:bg-secondary-container/20 hover:text-secondary"
                            >
                              <Icon name="send" size={18} />
                            </button>
                          )}
                          {canManage && (po.status === 'SENT' || po.status === 'PARTIALLY_RECEIVED') && (
                            <button
                              onClick={() => setReceiveFor(po.id)}
                              title="Receive goods"
                              className="rounded-lg p-1.5 text-on-surface-variant hover:bg-success/10 hover:text-success"
                            >
                              <Icon name="inventory" size={18} />
                            </button>
                          )}
                          {canManage && (po.status === 'DRAFT' || po.status === 'SENT') && (
                            <button
                              onClick={() => setPending({ kind: 'cancel', id: po.id, label: po.poNumber })}
                              title="Cancel order"
                              className="rounded-lg p-1.5 text-on-surface-variant hover:bg-error/10 hover:text-error"
                            >
                              <Icon name="cancel" size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination meta={list.data?.pagination} onPage={setPage} />

      <PurchaseOrderBuilder open={building} onClose={() => setBuilding(false)} />
      <ReceiveGoodsDialog
        purchaseOrderId={receiveFor}
        open={receiveFor !== null}
        onClose={() => setReceiveFor(null)}
      />

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'send' ? 'Send to supplier?' : 'Cancel purchase order?'}
        description={
          pending?.kind === 'send'
            ? `${pending?.label} will be marked as placed with the supplier. Goods can then be received against it.`
            : `${pending?.label} will be cancelled. This is only possible while no goods have been received.`
        }
        confirmLabel={pending?.kind === 'send' ? 'Send order' : 'Cancel order'}
        tone={pending?.kind === 'send' ? 'primary' : 'danger'}
        loading={send.isPending || cancel.isPending}
        onConfirm={runPending}
        onClose={() => setPending(null)}
      />
    </>
  )
}
