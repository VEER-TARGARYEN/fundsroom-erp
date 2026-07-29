import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useCustomers, type CustomerListParams } from '@/api/customers.api'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAuth } from '@/features/auth/AuthContext'
import { CUSTOMER_STATUS, CUSTOMER_TYPE } from '@/config/statusMeta'
import { formatDate } from '@/lib/utils'
import { CustomerFormModal } from './CustomerFormModal'
import { CustomerDrawer } from './CustomerDrawer'
import type { Customer, CustomerStatus, CustomerType } from '@/types/api'

export function CustomersPage() {
  const { user } = useAuth()
  const canWrite = user?.role === 'ADMIN' || user?.role === 'SALES'
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<CustomerStatus | 'ALL'>('ALL')
  const [type, setType] = useState<CustomerType | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const debounced = useDebouncedValue(search)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)

  useEffect(() => setPage(1), [debounced, status, type])

  // Open create modal from the command palette (?new=1).
  useEffect(() => {
    if (params.get('new') === '1' && canWrite) {
      setEditing(null)
      setFormOpen(true)
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, canWrite, setParams])

  const query: CustomerListParams = {
    page,
    limit: 20,
    search: debounced || undefined,
    status: status === 'ALL' ? undefined : status,
    type: type === 'ALL' ? undefined : type,
  }
  const { data, isLoading, isError, error, refetch, isFetching } = useCustomers(query)

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(c: Customer) {
    setSelectedId(null)
    setEditing(c)
    setFormOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="CRM directory — search, filter and manage customer relationships."
        actions={
          canWrite && (
            <Button icon="person_add" onClick={openCreate}>
              Add Customer
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, contact or GSTIN…" className="pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="sm:w-44">
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="LEAD">Lead</option>
          <option value="INACTIVE">Inactive</option>
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="sm:w-40">
          <option value="ALL">All types</option>
          <option value="WHOLESALE">Wholesale</option>
          <option value="RETAIL">Retail</option>
        </Select>
        {isFetching && !isLoading && <Icon name="progress_activity" size={18} className="animate-spin text-on-surface-variant" />}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (data?.data.length ?? 0) === 0 ? (
          <EmptyState
            icon="group_off"
            title="No customers found"
            hint="Adjust your search or filters, or add a new customer."
            action={canWrite && <Button size="sm" icon="person_add" onClick={openCreate}>Add Customer</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-low font-label-caps text-label-caps uppercase text-on-surface-variant">
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">GSTIN</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Follow-up</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {data!.data.map((c) => (
                  <tr key={c.id} onClick={() => setSelectedId(c.id)} className="cursor-pointer transition-colors hover:bg-surface-container-high">
                    <td className="px-4 py-3">
                      <p className="text-body-md text-on-surface">{c.businessName}</p>
                      <p className="font-mono text-data-mono text-on-surface-variant">{c.mobile}</p>
                    </td>
                    <td className="px-4 py-3 text-body-sm text-on-surface-variant">{c.contactPerson}</td>
                    <td className="px-4 py-3 font-mono text-data-mono text-on-surface-variant">{c.gstin ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={CUSTOMER_TYPE[c.type].tone}>{CUSTOMER_TYPE[c.type].label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={CUSTOMER_STATUS[c.status].tone} dot>
                        {CUSTOMER_STATUS[c.status].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-data-mono text-on-surface-variant">
                      {c.followUpDate ? formatDate(c.followUpDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedId(c.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/20 px-2 py-1 text-data-mono text-on-surface-variant hover:bg-surface-container-high"
                      >
                        View <Icon name="chevron_right" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!isLoading && !isError && <Pagination meta={data?.pagination} onPage={setPage} />}

      <CustomerFormModal open={formOpen} onClose={() => setFormOpen(false)} customer={editing} />
      <CustomerDrawer
        customerId={selectedId}
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        onEdit={openEdit}
      />
    </>
  )
}
