import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import {
  useNotifications,
  useToggleRead,
  useMarkAllRead,
  useRunScan,
  useAgentStatus,
  type Notification,
  type NotificationSeverity,
} from '@/api/notifications.api'
import { usePrefs, typesFilter } from '@/features/settings/prefs'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState, LoadingState, ErrorState } from '@/components/ui/states'
import { m } from '@/components/motion'
import { cn, relativeTime } from '@/lib/utils'

const SEVERITY: Record<NotificationSeverity, { chip: string; tone: 'error' | 'warning' | 'indigo' }> = {
  CRITICAL: { chip: 'bg-error/15 text-error', tone: 'error' },
  WARNING: { chip: 'bg-warning/15 text-warning', tone: 'warning' },
  INFO: { chip: 'bg-secondary-container/25 text-secondary', tone: 'indigo' },
}

const TYPE_ICON: Record<Notification['type'], string> = {
  OUT_OF_STOCK: 'inventory_2',
  LOW_STOCK: 'inventory_2',
  DRAFT_STALE: 'pending_actions',
  FOLLOW_UP_DUE: 'trending_up',
}

export function NotificationsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [page, setPage] = useState(1)
  const [prefs] = usePrefs()

  const q = useNotifications({
    page,
    limit: 20,
    unread: tab === 'unread',
    types: typesFilter(prefs),
  })
  const agent = useAgentStatus()
  const toggleRead = useToggleRead()
  const markAll = useMarkAllRead()
  const scan = useRunScan()

  const items = q.data?.data ?? []
  const unread = q.data?.unread ?? 0

  function switchTab(t: 'all' | 'unread') {
    setTab(t)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Raised automatically by the operations agent from live inventory, sales and CRM data."
        actions={
          <>
            {isAdmin && (
              <Button
                variant="ai"
                size="sm"
                icon="radar"
                loading={scan.isPending}
                onClick={() => scan.mutate()}
              >
                Run scan
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon="done_all"
              disabled={unread === 0 || markAll.isPending}
              loading={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </Button>
          </>
        }
      />

      {scan.isSuccess && scan.data && (
        <Card className="mb-4 border-secondary-container/30 p-4">
          <div className="flex items-start gap-3">
            <Icon name="auto_awesome" size={18} className="mt-0.5 shrink-0 text-secondary" />
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-on-surface">
                Scan complete — {scan.data.detected} conditions found · {scan.data.created} new ·{' '}
                {scan.data.resolved} resolved · {scan.data.durationMs} ms
              </p>
              {scan.data.digest && (
                <p className="mt-2 whitespace-pre-wrap text-body-sm text-on-surface-variant">
                  {scan.data.digest}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['all', 'unread'] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-body-sm font-medium capitalize transition-colors',
              tab === t
                ? 'bg-surface-container-highest text-on-surface'
                : 'text-on-surface-variant hover:bg-surface-container-high',
            )}
          >
            {t}
            {t === 'unread' && unread > 0 && (
              <span className="ml-1.5 rounded-full bg-secondary-container/40 px-1.5 font-data-mono text-[10px] text-secondary">
                {unread}
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2 text-body-sm text-on-surface-variant">
          {agent.data?.aiConfigured && <Badge tone="indigo">AI digest</Badge>}
          {agent.data?.emailConfigured && <Badge tone="success">Email on</Badge>}
          {agent.data?.scheduleConfigured && <Badge tone="neutral">Scheduled</Badge>}
        </span>
      </div>

      <Card className="p-2">
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.isLoading ? (
          <LoadingState label="Loading alerts…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon="notifications_off"
            title={tab === 'unread' ? "You're all caught up" : 'No open alerts'}
            hint={
              tab === 'unread'
                ? 'Nothing unread right now.'
                : 'The agent raises alerts when stock runs low, challans go unconfirmed, or follow-ups fall due.'
            }
            action={
              isAdmin ? (
                <Button variant="secondary" size="sm" icon="radar" onClick={() => scan.mutate()}>
                  Run a scan now
                </Button>
              ) : undefined
            }
          />
        ) : (
          <m.ul
            className="divide-y divide-outline-variant/10"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03 } } }}
          >
            {items.map((n) => {
              const isRead = n.readAt !== null
              const sev = SEVERITY[n.severity]
              return (
                <m.li
                  key={n.id}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
                  }}
                  className={cn(
                    'flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-container-high',
                    !isRead && 'bg-surface-container-low',
                  )}
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', sev.chip)}>
                    <Icon name={TYPE_ICON[n.type]} size={18} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {!isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />}
                      <p className={cn('text-body-sm', isRead ? 'text-on-surface-variant' : 'font-medium text-on-surface')}>
                        {n.title}
                      </p>
                      <Badge tone={sev.tone}>{n.severity}</Badge>
                      {n.entityRef && (
                        <span className="font-mono text-data-mono text-on-surface-variant/70">{n.entityRef}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-body-sm text-on-surface-variant">{n.body}</p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="font-data-mono text-data-mono text-on-surface-variant/60">
                        {relativeTime(n.createdAt)}
                      </span>
                      {n.href && (
                        <Link to={n.href} className="text-body-sm text-secondary hover:underline">
                          View
                        </Link>
                      )}
                      <button
                        onClick={() => toggleRead.mutate(n.id)}
                        className="text-body-sm text-on-surface-variant hover:text-on-surface"
                      >
                        Mark {isRead ? 'unread' : 'read'}
                      </button>
                    </div>
                  </div>
                </m.li>
              )
            })}
          </m.ul>
        )}
      </Card>

      <Pagination meta={q.data?.pagination} onPage={setPage} />
    </>
  )
}
