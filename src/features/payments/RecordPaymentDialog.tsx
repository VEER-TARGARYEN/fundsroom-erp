import { useEffect, useState } from 'react'
import {
  useChallanPaymentSummary,
  useRecordPayment,
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
} from '@/api/payments.api'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/states'
import { useToast } from '@/components/feedback/ToastContext'
import { mapApiError } from '@/lib/errors'
import { money, formatDate } from '@/lib/utils'

const METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]

/**
 * Record a receipt against one challan.
 *
 * The outstanding balance is fetched fresh when the dialog opens rather than
 * passed in from the list row: the row may be seconds stale, and the amount
 * field is bounded by it. The server re-checks the same limit transactionally,
 * so this is a convenience for the user, not the enforcement point.
 */
export function RecordPaymentDialog({
  challanId,
  open,
  onClose,
}: {
  challanId: string | null
  open: boolean
  onClose: () => void
}) {
  const summary = useChallanPaymentSummary(open ? challanId : null)
  const record = useRecordPayment()
  const toast = useToast()

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const outstanding = Number.parseFloat(summary.data?.outstanding ?? '0')

  // Prefill with the full balance — settling in full is the common case.
  useEffect(() => {
    if (summary.data) setAmount(summary.data.outstanding)
  }, [summary.data])

  useEffect(() => {
    if (!open) {
      setError(null)
      setReference('')
      setNote('')
      setMethod('BANK_TRANSFER')
    }
  }, [open])

  const parsed = Number.parseFloat(amount)
  const invalid =
    !Number.isFinite(parsed) || parsed <= 0 || (outstanding > 0 && parsed > outstanding + 0.005)

  async function submit() {
    if (!challanId || invalid) return
    setError(null)
    try {
      const res = await record.mutateAsync({
        challanId,
        amount: parsed,
        method,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      })
      toast.push({
        tone: 'success',
        title: res.settled ? 'Invoice settled' : 'Payment recorded',
        description: res.settled
          ? `${summary.data?.challanNumber} is now fully paid.`
          : `Balance now ${money(res.outstanding)}.`,
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
      title="Record payment"
      description={summary.data ? `Against ${summary.data.challanNumber}` : undefined}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            icon="payments"
            loading={record.isPending}
            disabled={invalid || summary.isLoading}
            onClick={() => void submit()}
          >
            Record
          </Button>
        </>
      }
    >
      {summary.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2.5 text-body-sm text-error">
              <Icon name="error" size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Invoice position */}
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-outline-variant/15 bg-surface-container-low p-3">
            {[
              ['Invoice', summary.data?.total],
              ['Paid', summary.data?.paid],
              ['Outstanding', summary.data?.outstanding],
            ].map(([label, val], i) => (
              <div key={label}>
                <p className="font-label-caps text-label-caps uppercase text-on-surface-variant/70">
                  {label}
                </p>
                <p
                  className={`mt-0.5 font-mono text-body-sm ${
                    i === 2 ? 'font-semibold text-warning' : 'text-on-surface'
                  }`}
                >
                  {money(val ?? '0')}
                </p>
              </div>
            ))}
          </div>

          <Field label="Amount received" htmlFor="pay-amount" required>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={outstanding || undefined}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Maximum {money(summary.data?.outstanding ?? '0')} — part payments are allowed.
            </p>
          </Field>

          <Field label="Method" htmlFor="pay-method" required>
            <select
              id="pay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="h-9 w-full rounded-lg border border-outline-variant/25 bg-surface-container-low px-3 text-body-sm text-on-surface focus:border-secondary focus:outline-none"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Reference" htmlFor="pay-ref">
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UTR / cheque no. / UPI ref"
            />
          </Field>

          <Field label="Note" htmlFor="pay-note">
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </Field>

          {/* Existing receipts, so the user can see what's already booked. */}
          {(summary.data?.payments.length ?? 0) > 0 && (
            <div>
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant/70">
                Receipts so far
              </p>
              <ul className="mt-1.5 divide-y divide-outline-variant/10 rounded-lg border border-outline-variant/15">
                {summary.data!.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-body-sm">
                    <span className="font-mono text-on-surface">{money(p.amount)}</span>
                    <span className="text-on-surface-variant">
                      {PAYMENT_METHOD_LABEL[p.method]}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </span>
                    <span className="ml-auto font-data-mono text-data-mono text-on-surface-variant/70">
                      {formatDate(p.paidAt)}
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
