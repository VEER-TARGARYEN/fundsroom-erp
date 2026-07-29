import { Drawer } from '@/components/ui/Drawer'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { LoadingState, ErrorState } from '@/components/ui/states'
import { useCustomer } from '@/api/customers.api'
import { CUSTOMER_STATUS, CUSTOMER_TYPE, CHALLAN_STATUS } from '@/config/statusMeta'
import { formatDate, money, relativeTime } from '@/lib/utils'
import type { Customer } from '@/types/api'

interface Props {
  customerId: string | null
  open: boolean
  onClose: () => void
  onEdit: (c: Customer) => void
}

export function CustomerDrawer({ customerId, open, onClose, onEdit }: Props) {
  const { data: customer, isLoading, isError, error, refetch } = useCustomer(open ? customerId : null)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      header={
        customer && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-title-md font-medium text-on-surface">{customer.businessName}</h2>
              <Badge tone={CUSTOMER_STATUS[customer.status].tone} dot>
                {CUSTOMER_STATUS[customer.status].label}
              </Badge>
              <Badge tone={CUSTOMER_TYPE[customer.type].tone}>{CUSTOMER_TYPE[customer.type].label}</Badge>
            </div>
            <p className="mt-0.5 font-mono text-data-mono text-on-surface-variant">{customer.id}</p>
          </div>
        )
      }
      footer={
        customer && (
          <div className="flex gap-2">
            <Button variant="secondary" icon="edit" onClick={() => onEdit(customer)} className="flex-1">
              Edit
            </Button>
          </div>
        )
      }
    >
      {isLoading && <LoadingState />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}
      {customer && (
        <div className="space-y-6">
          <section className="space-y-2.5">
            <Detail icon="person" label="Contact" value={customer.contactPerson} />
            <Detail icon="call" label="Mobile" value={customer.mobile} mono />
            <Detail icon="mail" label="Email" value={customer.email ?? '—'} />
            <Detail
              icon="location_on"
              label="Address"
              value={[customer.addressLine1, customer.city, customer.state, customer.pincode].filter(Boolean).join(', ') || '—'}
            />
          </section>

          <section className="rounded-lg border border-outline-variant/15 bg-surface-container px-3 py-2.5">
            <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">GSTIN</p>
            <p className="font-mono text-body-sm text-on-surface">{customer.gstin ?? '—'}</p>
          </section>

          {/* AI summary (derived; generative backend pending) */}
          <section className="ai-glow rounded-xl border border-secondary-container/20 bg-surface-container p-4">
            <div className="flex items-center gap-2">
              <Icon name="auto_awesome" size={18} className="text-secondary" />
              <h3 className="text-body-sm font-medium text-on-surface">AI Summary</h3>
              <Badge tone="indigo" className="ml-auto">backend pending</Badge>
            </div>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              {summarize(customer)}
            </p>
          </section>

          {customer.notes && (
            <section>
              <h3 className="mb-1.5 text-body-sm font-medium text-on-surface">Notes</h3>
              <p className="rounded-lg border border-outline-variant/15 bg-surface-container-low px-3 py-2.5 text-body-sm text-on-surface-variant">
                {customer.notes}
              </p>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-body-sm font-medium text-on-surface">
              Recent challans
              <span className="ml-1.5 font-mono text-data-mono text-on-surface-variant">
                ({customer.challans?.length ?? 0})
              </span>
            </h3>
            {(customer.challans?.length ?? 0) === 0 ? (
              <p className="rounded-lg border border-dashed border-outline-variant/20 px-3 py-6 text-center text-body-sm text-on-surface-variant">
                No challans yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {customer.challans!.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-lg border border-outline-variant/10 bg-surface-container px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-body-sm text-on-surface">{c.challanNumber}</p>
                      <p className="text-data-mono text-on-surface-variant">{relativeTime(c.createdAt)}</p>
                    </div>
                    <span className="font-mono text-body-sm text-on-surface">{money(c.totalAmount)}</span>
                    <Badge tone={CHALLAN_STATUS[c.status].tone}>{CHALLAN_STATUS[c.status].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  )
}

function Detail({ icon, label, value, mono }: { icon: string; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
        <Icon name={icon} size={16} />
      </span>
      <div className="min-w-0">
        <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">{label}</p>
        <p className={mono ? 'font-mono text-body-sm text-on-surface' : 'text-body-sm text-on-surface'}>{value}</p>
      </div>
    </div>
  )
}

function summarize(c: Customer): string {
  const count = c.challans?.length ?? 0
  const last = c.followUpDate ? `Follow-up due ${formatDate(c.followUpDate)}.` : 'No follow-up scheduled.'
  const status =
    c.status === 'ACTIVE' ? 'An active account' : c.status === 'LEAD' ? 'A lead in the pipeline' : 'A dormant account'
  return `${status} (${CUSTOMER_TYPE[c.type].label.toLowerCase()}) with ${count} recorded challan${count === 1 ? '' : 's'}. ${last}`
}
