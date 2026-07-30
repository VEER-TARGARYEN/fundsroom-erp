import { useMemo, useState } from 'react'
import { useProducts } from '@/api/products.api'
import { useSuppliers, useCreatePurchaseOrder } from '@/api/purchasing.api'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/feedback/ToastContext'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { mapApiError } from '@/lib/errors'
import { money, cn } from '@/lib/utils'
import { GST_RATE } from '@/config/company'

interface Line {
  productId: string
  sku: string
  name: string
  quantity: string
  unitCost: string
}

const selectClass =
  'h-9 w-full rounded-lg border border-outline-variant/25 bg-surface-container-low px-3 text-body-sm text-on-surface focus:border-secondary focus:outline-none'

/**
 * Build a DRAFT purchase order.
 *
 * Totals are shown client-side for immediate feedback, but the server recomputes
 * them from the same inputs — the figures posted are never trusted. Unit cost
 * defaults to the product's sale price purely as a starting point; a buyer is
 * expected to replace it with what the supplier actually quoted, which is why
 * it's an editable field per line rather than derived.
 */
export function PurchaseOrderBuilder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [supplierId, setSupplierId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const debounced = useDebouncedValue(search, 250)
  const suppliers = useSuppliers({ limit: 100, isActive: true })
  const products = useProducts({ limit: 20, search: debounced || undefined })
  const create = useCreatePurchaseOrder()
  const toast = useToast()

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, l) => {
      const q = Number.parseFloat(l.quantity) || 0
      const c = Number.parseFloat(l.unitCost) || 0
      return sum + q * c
    }, 0)
    const tax = subtotal * GST_RATE
    return { subtotal, tax, total: subtotal + tax }
  }, [lines])

  function addProduct(p: { id: string; sku: string; name: string; unitPrice: string }) {
    setLines((cur) => {
      if (cur.some((l) => l.productId === p.id)) return cur
      return [...cur, { productId: p.id, sku: p.sku, name: p.name, quantity: '1', unitCost: p.unitPrice }]
    })
    setSearch('')
  }

  function reset() {
    setSupplierId('')
    setExpectedDate('')
    setNotes('')
    setLines([])
    setSearch('')
    setError(null)
  }

  const valid =
    supplierId !== '' &&
    lines.length > 0 &&
    lines.every((l) => (Number.parseInt(l.quantity, 10) || 0) > 0 && Number.parseFloat(l.unitCost) >= 0)

  async function submit() {
    if (!valid) return
    setError(null)
    try {
      const po = await create.mutateAsync({
        supplierId,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: Number.parseInt(l.quantity, 10),
          unitCost: Number.parseFloat(l.unitCost),
        })),
        expectedDate: expectedDate || undefined,
        notes: notes.trim() || undefined,
      })
      toast.push({
        tone: 'success',
        title: `${po.poNumber} created`,
        description: 'Draft saved — send it to the supplier when ready.',
      })
      reset()
      onClose()
    } catch (err) {
      setError(mapApiError(err))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New purchase order"
      size="lg"
      description="Order stock from a supplier. Nothing moves until goods are received."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            icon="save"
            loading={create.isPending}
            disabled={!valid}
            onClick={() => void submit()}
          >
            Save draft
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2.5 text-body-sm text-error">
            <Icon name="error" size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Supplier" htmlFor="po-supplier" required>
            <select
              id="po-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={selectClass}
            >
              <option value="">Select a supplier…</option>
              {(suppliers.data?.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.city ? ` — ${s.city}` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Expected delivery" htmlFor="po-date">
            <Input
              id="po-date"
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </Field>
        </div>

        {/* Product picker */}
        <Field label="Add products" htmlFor="po-search">
          <Input
            id="po-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or SKU…"
          />
        </Field>

        {debounced && (
          <ul className="max-h-44 divide-y divide-outline-variant/10 overflow-y-auto rounded-lg border border-outline-variant/15">
            {(products.data?.data ?? []).map((p) => {
              const added = lines.some((l) => l.productId === p.id)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={added}
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-body-sm transition-colors hover:bg-surface-container-high disabled:opacity-40"
                  >
                    <span className="min-w-0 flex-1 truncate text-on-surface">{p.name}</span>
                    <span className="font-mono text-data-mono text-on-surface-variant">{p.sku}</span>
                    <span className="font-mono text-on-surface-variant">{money(p.unitPrice)}</span>
                    <Icon name={added ? 'check' : 'add'} size={16} />
                  </button>
                </li>
              )
            })}
            {(products.data?.data.length ?? 0) === 0 && (
              <li className="px-3 py-3 text-center text-body-sm text-on-surface-variant">
                No products match.
              </li>
            )}
          </ul>
        )}

        {/* Lines */}
        {lines.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-outline-variant/15">
            <table className="w-full min-w-[560px] text-body-sm">
              <thead className="border-b border-outline-variant/10 bg-surface-container-low">
                <tr className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit cost</th>
                  <th className="px-3 py-2 text-right">Line total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {lines.map((l, i) => {
                  const lineTotal =
                    (Number.parseFloat(l.quantity) || 0) * (Number.parseFloat(l.unitCost) || 0)
                  return (
                    <tr key={l.productId}>
                      <td className="px-3 py-2">
                        <div className="text-on-surface">{l.name}</div>
                        <div className="font-mono text-data-mono text-on-surface-variant">{l.sku}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) =>
                            setLines((cur) =>
                              cur.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)),
                            )
                          }
                          className="h-8 w-20 rounded-lg border border-outline-variant/25 bg-surface-container-low px-2 text-right font-mono text-body-sm text-on-surface focus:border-secondary focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.unitCost}
                          onChange={(e) =>
                            setLines((cur) =>
                              cur.map((x, j) => (j === i ? { ...x, unitCost: e.target.value } : x)),
                            )
                          }
                          className="h-8 w-28 rounded-lg border border-outline-variant/25 bg-surface-container-low px-2 text-right font-mono text-body-sm text-on-surface focus:border-secondary focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-on-surface">
                        {money(lineTotal)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))}
                          className="rounded-lg p-1 text-on-surface-variant hover:bg-error/10 hover:text-error"
                          aria-label="Remove line"
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {lines.length > 0 && (
          <div className="ml-auto w-full max-w-xs space-y-1 text-body-sm">
            {[
              ['Subtotal', totals.subtotal],
              [`GST @ ${GST_RATE * 100}%`, totals.tax],
            ].map(([label, val]) => (
              <div key={label as string} className="flex justify-between text-on-surface-variant">
                <span>{label}</span>
                <span className="font-mono">{money(val as number)}</span>
              </div>
            ))}
            <div
              className={cn(
                'flex justify-between border-t border-outline-variant/20 pt-1 font-medium text-on-surface',
              )}
            >
              <span>Total</span>
              <span className="font-mono">{money(totals.total)}</span>
            </div>
          </div>
        )}

        <Field label="Notes" htmlFor="po-notes">
          <Input
            id="po-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — delivery instructions, quote reference…"
          />
        </Field>
      </div>
    </Modal>
  )
}
