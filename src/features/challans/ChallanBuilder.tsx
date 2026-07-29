import { useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { Icon } from '@/components/ui/Icon'
import { LoadingState } from '@/components/ui/states'
import { useToast } from '@/components/feedback/ToastContext'
import { useCustomers } from '@/api/customers.api'
import { useProducts } from '@/api/products.api'
import { useCreateChallan, useConfirmChallan } from '@/api/challans.api'
import { cn, money } from '@/lib/utils'
import { insufficientStockItems, mapApiError } from '@/lib/errors'
import type { InsufficientStockItem, Product } from '@/types/api'

const GST_RATE = 0.18

interface Row {
  key: number
  productId: string
  qty: string
}

export function ChallanBuilder({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const rowKey = useRef(1)
  const [customerId, setCustomerId] = useState('')
  const [rows, setRows] = useState<Row[]>([{ key: 0, productId: '', qty: '' }])
  const [shortfalls, setShortfalls] = useState<InsufficientStockItem[]>([])

  const customersQ = useCustomers({ limit: 100 })
  const productsQ = useProducts({ limit: 100 })
  const products = productsQ.data?.data ?? []
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const create = useCreateChallan()
  const confirm = useConfirmChallan()

  const selectedIds = rows.map((r) => r.productId).filter(Boolean)
  const validItems = rows
    .map((r) => ({ product: productMap.get(r.productId), qty: Number(r.qty) || 0 }))
    .filter((x): x is { product: Product; qty: number } => !!x.product && x.qty > 0)

  const subtotal = validItems.reduce((s, i) => s + Number.parseFloat(i.product.unitPrice) * i.qty, 0)
  const tax = subtotal * GST_RATE
  const total = subtotal + tax
  const hasStockIssue = rows.some((r) => {
    const p = productMap.get(r.productId)
    return p ? Number(r.qty) > p.stockQuantity : false
  })
  const canSave = !!customerId && validItems.length > 0
  const canConfirm = canSave && !hasStockIssue

  function addRow() {
    setRows((r) => [...r, { key: rowKey.current++, productId: '', qty: '' }])
  }
  function removeRow(key: number) {
    setRows((r) => r.filter((x) => x.key !== key))
  }
  function setRow(key: number, patch: Partial<Row>) {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  }

  function payload() {
    return {
      customerId,
      items: validItems.map((i) => ({ productId: i.product.id, quantity: i.qty })),
    }
  }

  async function saveDraft() {
    try {
      const c = await create.mutateAsync(payload())
      toast.push({ tone: 'info', title: `Draft saved — ${c.challanNumber}`, description: 'Stock not deducted.' })
      onDone()
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not save draft', description: mapApiError(err) })
    }
  }

  async function createAndConfirm() {
    setShortfalls([])
    try {
      const c = await create.mutateAsync(payload())
      try {
        await confirm.mutateAsync(c.id)
        toast.push({ tone: 'success', title: `Challan confirmed — ${c.challanNumber}`, description: 'Stock deducted and logged.' })
        onDone()
      } catch (confErr) {
        const items = insufficientStockItems(confErr)
        if (items.length) {
          setShortfalls(items)
          toast.push({ tone: 'error', title: 'Insufficient stock', description: `Draft ${c.challanNumber} saved — fix quantities and confirm from the list.` })
        } else {
          toast.push({ tone: 'error', title: 'Could not confirm', description: mapApiError(confErr) })
        }
      }
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not create challan', description: mapApiError(err) })
    }
  }

  if (customersQ.isLoading || productsQ.isLoading) return <LoadingState label="Loading customers & products…" />

  const busy = create.isPending || confirm.isPending

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <button onClick={onDone} className="rounded-lg border border-outline-variant/20 p-2 text-on-surface-variant hover:bg-surface-container-high" aria-label="Back">
          <Icon name="arrow_back" size={20} />
        </button>
        <div>
          <h1 className="text-headline-sm font-medium text-on-surface">New Sales Challan</h1>
          <p className="text-body-sm text-on-surface-variant">Select a customer, add items, then save or confirm.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-gutter xl:grid-cols-3">
        <div className="space-y-gutter xl:col-span-2">
          <Card className="p-5">
            <Field label="Customer" required>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Select a customer…</option>
                {(customersQ.data?.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.businessName} — {c.contactPerson}</option>
                ))}
              </Select>
            </Field>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-outline-variant/10 px-5 py-3">
              <h2 className="text-body-md font-medium text-on-surface">Line items</h2>
              <Button size="sm" variant="secondary" icon="add" onClick={addRow}>Add item</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-body-sm">
                <thead>
                  <tr className="border-b border-outline-variant/10 bg-surface-container-low font-label-caps text-label-caps uppercase text-on-surface-variant">
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">Stock</th>
                    <th className="px-4 py-2.5 text-right font-medium">Price</th>
                    <th className="w-32 px-4 py-2.5 font-medium">Qty</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {rows.map((row) => {
                    const p = productMap.get(row.productId)
                    const qty = Number(row.qty) || 0
                    const exceeds = p ? qty > p.stockQuantity : false
                    const lineTotal = p ? Number.parseFloat(p.unitPrice) * qty : 0
                    return (
                      <tr key={row.key} className="align-top">
                        <td className="px-4 py-2.5">
                          <Select value={row.productId} invalid={exceeds} onChange={(e) => setRow(row.key, { productId: e.target.value })}>
                            <option value="">Select product…</option>
                            {products
                              .filter((pr) => pr.id === row.productId || !selectedIds.includes(pr.id))
                              .map((pr) => (
                                <option key={pr.id} value={pr.id}>{pr.sku} · {pr.name}</option>
                              ))}
                          </Select>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-data-mono text-on-surface-variant">{p ? p.stockQuantity : '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-on-surface">{p ? money(p.unitPrice) : '—'}</td>
                        <td className="px-4 py-2.5">
                          <Input value={row.qty} invalid={exceeds} inputMode="numeric" disabled={!p} onChange={(e) => setRow(row.key, { qty: e.target.value.replace(/\D/g, '') })} className="h-8 w-24 font-mono" placeholder="0" />
                          {exceeds && p && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-error/15 px-2 py-0.5 text-[11px] text-error">
                              <Icon name="warning" size={12} /> Max {p.stockQuantity}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-on-surface">{money(lineTotal)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => removeRow(row.key)} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-error/10 hover:text-error" aria-label="Remove">
                            <Icon name="delete" size={18} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {shortfalls.length > 0 && (
            <Card className="border-error/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-error">
                <Icon name="error" size={18} />
                <h3 className="text-body-sm font-medium">Insufficient stock</h3>
              </div>
              <ul className="space-y-1 text-body-sm text-on-surface-variant">
                {shortfalls.map((s) => (
                  <li key={s.productId} className="font-mono text-data-mono">
                    {s.sku ?? s.productId}: requested {s.requested}, only {s.available} available
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="xl:col-span-1">
          <Card className="p-5 xl:sticky xl:top-24">
            <h2 className="text-body-md font-medium text-on-surface">Order summary</h2>
            <dl className="mt-4 space-y-2.5 text-body-sm">
              <Line label="Items" value={String(validItems.length)} />
              <Line label="Subtotal" value={money(subtotal)} />
              <Line label="GST @ 18%" value={money(tax)} />
              <div className="mt-2 flex items-center justify-between border-t border-outline-variant/10 pt-3">
                <dt className="font-medium text-on-surface">Grand Total</dt>
                <dd className="font-mono text-title-md font-medium text-on-surface">{money(total)}</dd>
              </div>
            </dl>
            {hasStockIssue && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-error/10 px-3 py-2 text-data-mono text-error">
                <Icon name="warning" size={16} /> Fix over-stock quantities to confirm.
              </p>
            )}
            <div className="mt-4 space-y-2">
              <Button variant="secondary" icon="save" onClick={saveDraft} disabled={!canSave} loading={create.isPending && !confirm.isPending} className="w-full">
                Save as Draft
              </Button>
              <Button icon="check_circle" onClick={createAndConfirm} disabled={!canConfirm} loading={busy} className="w-full">
                Create &amp; Confirm
              </Button>
            </div>
            <p className="mt-2 text-center text-data-mono text-on-surface-variant/60">
              Confirming deducts stock atomically on the server.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className={cn('font-mono text-on-surface')}>{value}</dd>
    </div>
  )
}
