import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/utils'
import { useAdjustStock } from '@/api/products.api'
import { useToast } from '@/components/feedback/ToastContext'
import { mapApiError } from '@/lib/errors'
import type { Product } from '@/types/api'

interface Props {
  open: boolean
  onClose: () => void
  product: Product | null
}

/** MANUAL_ADJUST — signed delta + reason. ADMIN / WAREHOUSE only (backend enforced). */
export function AdjustStockModal({ open, onClose, product }: Props) {
  const adjust = useAdjustStock()
  const toast = useToast()
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDirection('in')
      setQty('')
      setReason('')
      setError(null)
    }
  }, [open])

  if (!product) return null

  const amount = Number(qty) || 0
  const delta = direction === 'in' ? amount : -amount
  const projected = product.stockQuantity + delta
  const invalid = amount <= 0 || projected < 0 || !reason.trim()

  async function submit() {
    setError(null)
    try {
      await adjust.mutateAsync({ id: product!.id, quantityChange: delta, reason: reason.trim() })
      toast.push({
        tone: 'success',
        title: 'Stock adjusted',
        description: `${product!.sku} → ${projected} units`,
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
      title="Adjust stock"
      description={`${product.sku} · ${product.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={adjust.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={adjust.isPending} disabled={invalid}>
            Post adjustment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2.5 text-body-sm text-error">
            <Icon name="error" size={18} className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border border-outline-variant/15 bg-surface-container-low px-3 py-2.5">
          <span className="text-body-sm text-on-surface-variant">Current stock</span>
          <span className="font-mono text-body-md text-on-surface">{product.stockQuantity}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDirection('in')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg border py-2 text-body-sm transition-colors',
              direction === 'in' ? 'border-success/40 bg-success/10 text-success' : 'border-outline-variant/20 text-on-surface-variant',
            )}
          >
            <Icon name="add" size={18} /> Stock In
          </button>
          <button
            type="button"
            onClick={() => setDirection('out')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg border py-2 text-body-sm transition-colors',
              direction === 'out' ? 'border-error/40 bg-error/10 text-error' : 'border-outline-variant/20 text-on-surface-variant',
            )}
          >
            <Icon name="remove" size={18} /> Stock Out
          </button>
        </div>

        <Field label="Quantity" required>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} className="font-mono" placeholder="0" />
        </Field>

        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. PO #7781 received / damaged goods write-off" />
        </Field>

        <div className={cn('flex items-center justify-between rounded-lg px-3 py-2.5', projected < 0 ? 'bg-error/10 text-error' : 'bg-surface-container-highest text-on-surface')}>
          <span className="text-body-sm">New stock level</span>
          <span className="font-mono text-body-md">{projected}</span>
        </div>
        {projected < 0 && <p className="text-data-mono text-error">Adjustment would take stock below zero.</p>}
      </div>
    </Modal>
  )
}
