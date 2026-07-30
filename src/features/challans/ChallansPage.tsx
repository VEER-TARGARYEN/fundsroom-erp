import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Pagination } from '@/components/ui/Pagination'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useChallans, useConfirmChallan, useCancelChallan, type ChallanListParams } from '@/api/challans.api'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAuth } from '@/features/auth/AuthContext'
import { useToast } from '@/components/feedback/ToastContext'
import { CHALLAN_STATUS } from '@/config/statusMeta'
import { cn, formatDate, money } from '@/lib/utils'
import { insufficientStockItems, mapApiError } from '@/lib/errors'
import { ChallanBuilder } from './ChallanBuilder'
import type { ChallanStatus, InsufficientStockItem } from '@/types/api'

const TABS: (ChallanStatus | 'ALL')[] = ['ALL', 'DRAFT', 'CONFIRMED', 'CANCELLED']

export function ChallansPage() {
  const { user } = useAuth()
  const canCreate = user?.role === 'ADMIN' || user?.role === 'SALES'
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const [mode, setMode] = useState<'list' | 'create'>('list')
  const [tab, setTab] = useState<ChallanStatus | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebouncedValue(search)

  const [pending, setPending] = useState<{ kind: 'confirm' | 'cancel'; id: string; label: string } | null>(null)
  const [stockError, setStockError] = useState<InsufficientStockItem[] | null>(null)

  const confirm = useConfirmChallan()
  const cancel = useCancelChallan()

  useEffect(() => setPage(1), [debounced, tab])
  useEffect(() => {
    if (params.get('new') === '1' && canCreate) {
      setMode('create')
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, canCreate, setParams])

  const query: ChallanListParams = {
    page,
    limit: 20,
    search: debounced || undefined,
    status: tab === 'ALL' ? undefined : tab,
  }
  const { data, isLoading, isError, error, refetch, isFetching } = useChallans(query)

  async function runPending() {
    if (!pending) return
    const { kind, id, label } = pending
    setPending(null)
    try {
      if (kind === 'confirm') {
        await confirm.mutateAsync(id)
        toast.push({ tone: 'success', title: `Challan confirmed — ${label}`, description: 'Stock deducted and logged.' })
      } else {
        await cancel.mutateAsync(id)
        toast.push({ tone: 'info', title: `Challan cancelled — ${label}`, description: 'Any deducted stock was reversed.' })
      }
    } catch (err) {
      const items = insufficientStockItems(err)
      if (items.length) setStockError(items)
      else toast.push({ tone: 'error', title: 'Action failed', description: mapApiError(err) })
    }
  }

  if (mode === 'create') return <ChallanBuilder onDone={() => setMode('list')} />

  return (
    <>
      <PageHeader
        title="Sales Challans"
        subtitle="Create delivery challans and confirm to deduct stock atomically."
        actions={canCreate && <Button icon="note_add" onClick={() => setMode('create')}>New Challan</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-body-sm transition-colors',
                tab === t ? 'border-secondary/30 bg-secondary-container/20 text-secondary' : 'border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high',
              )}
            >
              {t === 'ALL' ? 'All' : CHALLAN_STATUS[t].label}
            </button>
          ))}
        </div>
        <div className="relative lg:w-72">
          <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search challan no. or customer…" className="pl-9" />
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (data?.data.length ?? 0) === 0 ? (
          <EmptyState icon="receipt_long" title="No challans found" hint="Adjust filters or create a new challan." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-low font-label-caps text-label-caps uppercase text-on-surface-variant">
                  <th className="px-4 py-3 font-medium">Challan No</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 text-right font-medium">Items</th>
                  <th className="px-4 py-3 text-right font-medium">GST</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {data!.data.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-surface-container-high">
                    <td className="px-4 py-3 font-mono text-data-mono text-on-surface">{c.challanNumber}</td>
                    <td className="px-4 py-3 font-mono text-data-mono text-on-surface-variant">{formatDate(c.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="text-body-sm text-on-surface">{c.customer?.businessName}</p>
                      <p className="text-data-mono text-on-surface-variant">{c.customer?.contactPerson}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-data-mono text-on-surface-variant">{c._count?.items ?? c.items?.length ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-data-mono text-on-surface-variant">{money(c.taxAmount)}</td>
                    <td className="px-4 py-3 text-right font-mono text-body-sm text-on-surface">{money(c.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={CHALLAN_STATUS[c.status].tone} dot>{CHALLAN_STATUS[c.status].label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {/* Opens the print view with the dialog already up, so
                            "invoice" is one click rather than two. */}
                        <Link
                          to={`/challans/${c.id}/print?auto=1`}
                          title={c.status === 'CONFIRMED' ? 'Print tax invoice' : 'Print delivery challan'}
                          className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-secondary"
                        >
                          <Icon name="print" size={18} />
                        </Link>
                        {c.status === 'DRAFT' && (
                          <button onClick={() => setPending({ kind: 'confirm', id: c.id, label: c.challanNumber })} title="Confirm" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-success/10 hover:text-success">
                            <Icon name="check_circle" size={18} />
                          </button>
                        )}
                        {(c.status === 'DRAFT' || c.status === 'CONFIRMED') && (
                          <button onClick={() => setPending({ kind: 'cancel', id: c.id, label: c.challanNumber })} title="Cancel" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-error/10 hover:text-error">
                            <Icon name="cancel" size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isFetching && !isLoading && <div className="border-t border-outline-variant/10 px-4 py-1.5 text-center text-data-mono text-on-surface-variant/60">updating…</div>}
      </Card>

      {!isLoading && !isError && <Pagination meta={data?.pagination} onPage={setPage} />}

      <ConfirmDialog
        open={!!pending}
        title={pending?.kind === 'confirm' ? 'Confirm challan?' : 'Cancel challan?'}
        description={
          pending?.kind === 'confirm'
            ? `This deducts stock for ${pending.label} and posts CHALLAN_OUT entries. This can’t be undone from here.`
            : `${pending?.label} will be cancelled. If it was confirmed, its stock is reversed.`
        }
        confirmLabel={pending?.kind === 'confirm' ? 'Confirm & deduct' : 'Cancel challan'}
        tone={pending?.kind === 'confirm' ? 'primary' : 'danger'}
        loading={confirm.isPending || cancel.isPending}
        onConfirm={runPending}
        onClose={() => setPending(null)}
      />

      <Modal open={!!stockError} onClose={() => setStockError(null)} title="Insufficient stock" description="This challan can’t be confirmed — some items don’t have enough stock.">
        <ul className="space-y-2">
          {(stockError ?? []).map((s) => (
            <li key={s.productId} className="flex items-center justify-between rounded-lg border border-outline-variant/15 bg-surface-container-low px-3 py-2 text-body-sm">
              <span className="font-mono text-on-surface">{s.sku ?? s.productId}</span>
              <span className="font-mono text-data-mono text-error">requested {s.requested} · {s.available} available</span>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
