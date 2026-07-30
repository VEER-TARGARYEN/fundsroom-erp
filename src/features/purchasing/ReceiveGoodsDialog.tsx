import { useEffect, useState } from 'react'
import { usePurchaseOrder, useReceiveGoods } from '@/api/purchasing.api'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/states'
import { useToast } from '@/components/feedback/ToastContext'
import { mapApiError } from '@/lib/errors'
import { money, formatDate, cn } from '@/lib/utils'

/**
 * Record a delivery against a purchase order.
 *
 * Quantities are fetched fresh when the dialog opens rather than passed in from
 * the list row: another storeman may have received against the same order
 * seconds ago, and each input is bounded by what is still outstanding. The
 * server re-checks the same limit under a row lock, so this is a convenience,
 * not the enforcement point.
 */
export function ReceiveGoodsDialog({
  purchaseOrderId,
  open,
  onClose,
}: {
  purchaseOrderId: string | null
  open: boolean
  onClose: () => void
}) {
  const po = usePurchaseOrder(open ? purchaseOrderId : null)
  const receive = useReceiveGoods()
  const toast = useToast()

  const [qty, setQty] = useState<Record<string, string>>({})
  const [supplierRef, setSupplierRef] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const lines = (po.data?.items ?? []).filter((i) => i.receivedQuantity < i.orderedQuantity)

  // Prefill each line with its full outstanding quantity — receiving the whole
  // delivery is the common case, and part-receipts are edited down from there.
  useEffect(() => {
    if (!po.data) return
    const next: Record<string, string> = {}
    for (const i of po.data.items ?? []) {
      const outstanding = i.orderedQuantity - i.receivedQuantity
      if (outstanding > 0) next[i.id] = String(outstanding)
    }
    setQty(next)
  }, [po.data])

  useEffect(() => {
    if (!open) {
      setError(null)
      setSupplierRef('')
      setNotes('')
    }
  }, [open])

  const payload = lines
    .map((l) => ({ id: l.id, n: Number.parseInt(qty[l.id] ?? '0', 10), max: l.orderedQuantity - l.receivedQuantity }))
    .filter((x) => Number.isFinite(x.n) && x.n > 0)

  const anyOver = payload.some((x) => x.n > x.max)
  const invalid = payload.length === 0 || anyOver

  async function submit() {
    if (!purchaseOrderId || invalid) return
    setError(null)
    try {
      const res = await receive.mutateAsync({
        purchaseOrderId,
        items: payload.map((x) => ({ purchaseOrderItemId: x.id, quantityReceived: x.n })),
        supplierRef: supplierRef.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      const done = res.purchaseOrder.status === 'RECEIVED'
      toast.push({
        tone: 'success',
        title: done ? 'Order fully received' : 'Goods received',
        description: `${res.receiptNumber} recorded — stock updated.`,
      })
      onClose()
    } catch (err) {
      setError(mapApiError(err))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receive goods"
      size="lg"
      description={po.data ? `Against ${po.data.poNumber}` : undefined}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            icon="inventory"
            loading={receive.isPending}
            disabled={invalid || po.isLoading}
            onClick={() => void submit()}
          >
            Record receipt
          </Button>
        </>
      }
    >
      {po.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2.5 text-body-sm text-error">
              <Icon name="error" size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {lines.length === 0 ? (
            <p className="py-6 text-center text-body-sm text-on-surface-variant">
              Every line on this order has already been received in full.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-outline-variant/15">
                <table className="w-full min-w-[520px] text-body-sm">
                  <thead className="border-b border-outline-variant/10 bg-surface-container-low">
                    <tr className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-right">Ordered</th>
                      <th className="px-3 py-2 text-right">Received</th>
                      <th className="px-3 py-2 text-right">Outstanding</th>
                      <th className="px-3 py-2 text-right">Receive now</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {lines.map((l) => {
                      const outstanding = l.orderedQuantity - l.receivedQuantity
                      const n = Number.parseInt(qty[l.id] ?? '0', 10)
                      const over = Number.isFinite(n) && n > outstanding
                      return (
                        <tr key={l.id}>
                          <td className="px-3 py-2">
                            <div className="text-on-surface">{l.productNameSnapshot}</div>
                            <div className="font-mono text-data-mono text-on-surface-variant">
                              {l.skuSnapshot} · {money(l.unitCost)}/unit
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-on-surface-variant">
                            {l.orderedQuantity}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-on-surface-variant">
                            {l.receivedQuantity}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-on-surface">
                            {outstanding}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              max={outstanding}
                              value={qty[l.id] ?? ''}
                              onChange={(e) => setQty((s) => ({ ...s, [l.id]: e.target.value }))}
                              className={cn(
                                'h-8 w-24 rounded-lg border bg-surface-container-low px-2 text-right font-mono text-body-sm text-on-surface focus:outline-none',
                                over
                                  ? 'border-error focus:border-error'
                                  : 'border-outline-variant/25 focus:border-secondary',
                              )}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {anyOver && (
                <p className="flex items-center gap-1.5 text-body-sm text-error">
                  <Icon name="error" size={15} />
                  One or more lines exceed what is still on order.
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Supplier reference" htmlFor="grn-ref">
                  <Input
                    id="grn-ref"
                    value={supplierRef}
                    onChange={(e) => setSupplierRef(e.target.value)}
                    placeholder="Their invoice / DC number"
                  />
                </Field>
                <Field label="Notes" htmlFor="grn-notes">
                  <Input
                    id="grn-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              </div>
            </>
          )}

          {(po.data?.receipts?.length ?? 0) > 0 && (
            <div>
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant/70">
                Previous receipts
              </p>
              <ul className="mt-1.5 divide-y divide-outline-variant/10 rounded-lg border border-outline-variant/15">
                {po.data!.receipts!.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-body-sm">
                    <span className="font-mono text-on-surface">{r.receiptNumber}</span>
                    <span className="text-on-surface-variant">
                      {r.items.reduce((s, i) => s + i.quantityReceived, 0)} units
                      {r.supplierRef ? ` · ${r.supplierRef}` : ''}
                    </span>
                    <span className="ml-auto font-data-mono text-data-mono text-on-surface-variant/70">
                      {formatDate(r.receivedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
