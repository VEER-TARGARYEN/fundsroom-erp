import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useCreateCustomer, useUpdateCustomer, type CustomerInput } from '@/api/customers.api'
import { useToast } from '@/components/feedback/ToastContext'
import { fieldErrors, mapApiError } from '@/lib/errors'
import type { Customer } from '@/types/api'

interface Props {
  open: boolean
  onClose: () => void
  /** When set, edits this customer instead of creating. */
  customer?: Customer | null
}

const EMPTY: CustomerInput = {
  businessName: '',
  contactPerson: '',
  mobile: '',
  email: '',
  gstin: '',
  type: 'WHOLESALE',
  status: 'LEAD',
  notes: '',
  followUpDate: '',
  addressLine1: '',
  city: '',
  state: '',
  pincode: '',
}

export function CustomerFormModal({ open, onClose, customer }: Props) {
  const create = useCreateCustomer()
  const update = useUpdateCustomer()
  const toast = useToast()
  const [form, setForm] = useState<CustomerInput>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const isEdit = !!customer

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(
      customer
        ? {
            businessName: customer.businessName,
            contactPerson: customer.contactPerson,
            mobile: customer.mobile,
            email: customer.email ?? '',
            gstin: customer.gstin ?? '',
            type: customer.type,
            status: customer.status,
            notes: customer.notes ?? '',
            followUpDate: customer.followUpDate?.slice(0, 10) ?? '',
            addressLine1: customer.addressLine1 ?? '',
            city: customer.city ?? '',
            state: customer.state ?? '',
            pincode: customer.pincode ?? '',
          }
        : EMPTY,
    )
  }, [open, customer])

  function set<K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }))
  }

  // Drop empty optional strings so the backend treats them as omitted.
  function clean(input: CustomerInput): CustomerInput {
    const out = { ...input }
    for (const key of ['email', 'gstin', 'notes', 'followUpDate', 'addressLine1', 'city', 'state', 'pincode'] as const) {
      if (!out[key]) delete out[key]
    }
    return out
  }

  async function submit() {
    setErrors({})
    try {
      if (isEdit && customer) {
        await update.mutateAsync({ id: customer.id, input: clean(form) })
        toast.push({ tone: 'success', title: 'Customer updated' })
      } else {
        await create.mutateAsync(clean(form))
        toast.push({ tone: 'success', title: 'Customer created' })
      }
      onClose()
    } catch (err) {
      const fe = fieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else toast.push({ tone: 'error', title: 'Could not save', description: mapApiError(err) })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit customer' : 'Add customer'}
      description="Fields marked * are required."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {isEdit ? 'Save changes' : 'Create customer'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Business name" required error={errors.businessName} className="sm:col-span-2">
          <Input value={form.businessName} invalid={!!errors.businessName} onChange={(e) => set('businessName', e.target.value)} />
        </Field>
        <Field label="Contact person" required error={errors.contactPerson}>
          <Input value={form.contactPerson} invalid={!!errors.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
        </Field>
        <Field label="Mobile" required error={errors.mobile}>
          <Input value={form.mobile} invalid={!!errors.mobile} inputMode="numeric" maxLength={10} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, ''))} className="font-mono" placeholder="9876543210" />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} invalid={!!errors.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="GSTIN" error={errors.gstin}>
          <Input value={form.gstin} invalid={!!errors.gstin} maxLength={15} onChange={(e) => set('gstin', e.target.value.toUpperCase())} className="font-mono uppercase" placeholder="27ABCDE1234F1Z5" />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={(e) => set('type', e.target.value as CustomerInput['type'])}>
            <option value="WHOLESALE">Wholesale</option>
            <option value="RETAIL">Retail</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => set('status', e.target.value as CustomerInput['status'])}>
            <option value="ACTIVE">Active</option>
            <option value="LEAD">Lead</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </Field>
        <Field label="Follow-up date" error={errors.followUpDate}>
          <Input type="date" value={form.followUpDate} onChange={(e) => set('followUpDate', e.target.value)} className="font-mono" />
        </Field>
        <Field label="Address" error={errors.addressLine1} className="sm:col-span-2">
          <Input value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} placeholder="Street / building" />
        </Field>
        <Field label="City" error={errors.city}>
          <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="State" error={errors.state}>
          <Input value={form.state} onChange={(e) => set('state', e.target.value)} />
        </Field>
        <Field label="PIN code" error={errors.pincode}>
          <Input value={form.pincode} inputMode="numeric" maxLength={6} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} className="font-mono" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Context, preferences, follow-up notes…" />
        </Field>
      </div>
    </Modal>
  )
}
