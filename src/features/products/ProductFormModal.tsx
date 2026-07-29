import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useCreateProduct, useUpdateProduct } from '@/api/products.api'
import { useToast } from '@/components/feedback/ToastContext'
import { fieldErrors, mapApiError } from '@/lib/errors'
import { CATEGORIES, WAREHOUSES } from '@/config/statusMeta'
import type { Product } from '@/types/api'

interface Props {
  open: boolean
  onClose: () => void
  product?: Product | null
}

interface FormState {
  sku: string
  name: string
  category: string
  warehouseLocation: string
  unitPrice: string
  stockQuantity: string
  minStock: string
}

const EMPTY: FormState = {
  sku: '',
  name: '',
  category: CATEGORIES[0],
  warehouseLocation: WAREHOUSES[0],
  unitPrice: '',
  stockQuantity: '',
  minStock: '',
}

export function ProductFormModal({ open, onClose, product }: Props) {
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const toast = useToast()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const isEdit = !!product

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(
      product
        ? {
            sku: product.sku,
            name: product.name,
            category: product.category,
            warehouseLocation: product.warehouseLocation,
            unitPrice: String(product.unitPrice),
            stockQuantity: String(product.stockQuantity),
            minStock: String(product.minStock),
          }
        : EMPTY,
    )
  }, [open, product])

  function set<K extends keyof FormState>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }))
  }

  async function submit() {
    setErrors({})
    try {
      if (isEdit && product) {
        // stockQuantity is intentionally NOT editable here — use Adjust Stock.
        await update.mutateAsync({
          id: product.id,
          input: {
            sku: form.sku.toUpperCase(),
            name: form.name,
            category: form.category,
            warehouseLocation: form.warehouseLocation,
            unitPrice: Number(form.unitPrice),
            minStock: Number(form.minStock),
          },
        })
        toast.push({ tone: 'success', title: 'Product updated' })
      } else {
        await create.mutateAsync({
          sku: form.sku.toUpperCase(),
          name: form.name,
          category: form.category,
          warehouseLocation: form.warehouseLocation,
          unitPrice: Number(form.unitPrice),
          stockQuantity: Number(form.stockQuantity || 0),
          minStock: Number(form.minStock || 0),
        })
        toast.push({ tone: 'success', title: 'Product created' })
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
      title={isEdit ? 'Edit product' : 'Add product'}
      description={isEdit ? 'Stock is managed via Adjust Stock, not here.' : 'Create a new SKU in the catalogue.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="SKU" required error={errors.sku}>
          <Input value={form.sku} invalid={!!errors.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} className="font-mono uppercase" />
        </Field>
        <Field label="Category" required>
          <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Product name" required error={errors.name} className="sm:col-span-2">
          <Input value={form.name} invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Warehouse" required>
          <Select value={form.warehouseLocation} onChange={(e) => set('warehouseLocation', e.target.value)}>
            {WAREHOUSES.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </Select>
        </Field>
        <Field label="Unit price (₹)" required error={errors.unitPrice}>
          <Input type="number" min={0} value={form.unitPrice} invalid={!!errors.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} className="font-mono" />
        </Field>
        {!isEdit && (
          <Field label="Opening stock" error={errors.stockQuantity}>
            <Input type="number" min={0} value={form.stockQuantity} invalid={!!errors.stockQuantity} onChange={(e) => set('stockQuantity', e.target.value)} className="font-mono" />
          </Field>
        )}
        <Field label="Minimum stock" required error={errors.minStock}>
          <Input type="number" min={0} value={form.minStock} invalid={!!errors.minStock} onChange={(e) => set('minStock', e.target.value)} className="font-mono" />
        </Field>
      </div>
    </Modal>
  )
}
