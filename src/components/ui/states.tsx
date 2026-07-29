import { cn } from '@/lib/utils'
import { mapApiError } from '@/lib/errors'
import { Icon } from './Icon'
import { Button } from './Button'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-surface-container-highest', className)} />
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
      <Icon name="progress_activity" size={28} className="animate-spin text-secondary" />
      <p className="text-body-sm">{label}</p>
    </div>
  )
}

export function EmptyState({
  icon = 'inbox',
  title,
  hint,
  action,
}: {
  icon?: string
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
        <Icon name={icon} size={24} />
      </span>
      <p className="text-body-md font-medium text-on-surface">{title}</p>
      {hint && <p className="max-w-sm text-body-sm text-on-surface-variant">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-error/15 text-error">
        <Icon name="error" size={24} />
      </span>
      <p className="text-body-md font-medium text-on-surface">Couldn’t load this</p>
      <p className="max-w-md text-body-sm text-on-surface-variant">{mapApiError(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry} className="mt-1">
          Retry
        </Button>
      )}
    </div>
  )
}
