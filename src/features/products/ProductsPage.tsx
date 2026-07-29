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
import { useProducts, type ProductListParams } from '@/api/products.api'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAuth } from '@/features/auth/AuthContext'
import { CATEGORIES, stockStatus } from '@/config/statusMeta'
import { cn, money } from '@/lib/utils'
import { ProductFormModal } from './ProductFormModal'
import { AdjustStockModal } from './AdjustStockModal'
import type { Product } from '@/types/api'

function healthPct(p: Product): number {
  if (p.stockQuantity <= 0) return 0
  if (p.minStock <= 0) return 100
  return Math.min(100, Math.round((p.stockQuantity / (p.minStock * 4)) * 100))
}

export function ProductsPage() {
  const { user } = useAuth()
  const canWrite = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE'
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL')
  const [lowOnly, setLowOnly] = useState(false)
  const [page, setPage] = useState(1)
  const debounced = useDebouncedValue(search)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [adjusting, setAdjusting] = useState<Product | null>(null)

  useEffect(() => setPage(1), [debounced, category, lowOnly])

  useEffect(() => {
    if (params.get('new') === '1' && canWrite) {
      setEditing(null)
      setFormOpen(true)
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, canWrite, setParams])

  const query: ProductListParams = {
    page,
    limit: 20,
    search: debounced || undefined,
    category: category === 'ALL' ? undefined : category,
    lowStock: lowOnly ? 'true' : undefined,
  }
  const { data, isLoading, isError, error, refetch, isFetching } = useProducts(query)

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Inventory catalogue — pricing, stock levels and manual adjustments."
        actions={
          canWrite && (
            <Button icon="add_box" onClick={() => { setEditing(null); setFormOpen(true) }}>
              Add Product
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product or SKU…" className="pl-9" />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="sm:w-48">
          <option value="ALL">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => setLowOnly((v) => !v)}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-body-sm transition-colors',
            lowOnly ? 'border-error/40 bg-error/10 text-error' : 'border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high',
          )}
        >
          <Icon name={lowOnly ? 'toggle_on' : 'toggle_off'} size={18} />
          Low stock only
        </button>
        {isFetching && !isLoading && <Icon name="progress_activity" size={18} className="animate-spin text-on-surface-variant" />}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (data?.data.length ?? 0) === 0 ? (
          <EmptyState icon="inventory_2" title="No products found" hint="Try a different search or category." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-low font-label-caps text-label-caps uppercase text-on-surface-variant">
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Warehouse</th>
                  <th className="px-4 py-3 text-right font-medium">Unit Price</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {canWrite && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {data!.data.map((p) => {
                  const st = stockStatus(p)
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-surface-container-high">
                      <td className="px-4 py-3 font-mono text-data-mono text-on-surface">{p.sku}</td>
                      <td className="px-4 py-3">
                        <p className="text-body-md text-on-surface">{p.name}</p>
                        <p className="text-data-mono text-on-surface-variant">{p.category}</p>
                      </td>
                      <td className="px-4 py-3 text-body-sm text-on-surface-variant">{p.warehouseLocation}</td>
                      <td className="px-4 py-3 text-right font-mono text-body-sm text-on-surface">{money(p.unitPrice)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-container-highest">
                            <div className={cn('h-full rounded-full', st.tone === 'error' ? 'bg-error' : st.tone === 'success' ? 'bg-success' : 'bg-on-surface-variant')} style={{ width: `${healthPct(p)}%` }} />
                          </div>
                          <span className="font-mono text-data-mono text-on-surface">{p.stockQuantity}</span>
                          <span className="font-mono text-[10px] text-on-surface-variant">/ min {p.minStock}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={st.tone} dot>{st.label}</Badge>
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setAdjusting(p)} title="Adjust stock" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-secondary">
                              <Icon name="tune" size={18} />
                            </button>
                            <button onClick={() => { setEditing(p); setFormOpen(true) }} title="Edit" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface">
                              <Icon name="edit" size={18} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!isLoading && !isError && <Pagination meta={data?.pagination} onPage={setPage} />}

      <ProductFormModal open={formOpen} onClose={() => setFormOpen(false)} product={editing} />
      <AdjustStockModal open={adjusting !== null} onClose={() => setAdjusting(null)} product={adjusting} />
    </>
  )
}
