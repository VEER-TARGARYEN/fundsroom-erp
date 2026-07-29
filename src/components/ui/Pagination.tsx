import { Icon } from './Icon'
import type { PaginationMeta } from '@/types/api'

export function Pagination({ meta, onPage }: { meta?: PaginationMeta; onPage: (page: number) => void }) {
  if (!meta) return null
  const { page, totalPages, total, limit } = meta
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <div className="mt-3 flex items-center justify-between text-body-sm text-on-surface-variant">
      <p>
        Showing <span className="font-mono text-on-surface">{from}</span>–
        <span className="font-mono text-on-surface">{to}</span> of{' '}
        <span className="font-mono text-on-surface">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-lg border border-outline-variant/20 p-1.5 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40"
          aria-label="Previous page"
        >
          <Icon name="chevron_left" size={18} />
        </button>
        <span className="px-2 font-mono text-data-mono text-on-surface">
          {page} / {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="rounded-lg border border-outline-variant/20 p-1.5 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40"
          aria-label="Next page"
        >
          <Icon name="chevron_right" size={18} />
        </button>
      </div>
    </div>
  )
}
