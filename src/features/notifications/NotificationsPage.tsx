import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import { useAuth } from '@/features/auth/AuthContext'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { EmptyState, LoadingState } from '@/components/ui/states'
import { usePrefs } from '@/features/settings/prefs'
import { money, relativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Challan, Customer, Paginated, Product, StockLog } from '@/types/api'

type Severity = 'error' | 'warning' | 'info' | 'neutral'

interface Notif {
  id: string
  severity: Severity
  icon: string
  title: string
  body: string
  time: string
  to?: string
}

const SEVERITY_STYLE: Record<Severity, string> = {
  error: 'bg-error/15 text-error',
  warning: 'bg-warning/15 text-warning',
  info: 'bg-secondary-container/25 text-secondary',
  neutral: 'bg-surface-container-highest text-on-surface-variant',
}

const READ_KEY = 'fundsroom.notif.read.v1'

function readReadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function NotificationsPage() {
  const { user } = useAuth()
  const role = user!.role
  const canProducts = ['ADMIN', 'SALES', 'WAREHOUSE'].includes(role)
  const canCRM = ['ADMIN', 'SALES', 'ACCOUNTS'].includes(role)
  const canLedger = ['ADMIN', 'WAREHOUSE'].includes(role)

  const [prefs] = usePrefs()
  const [readSet, setReadSet] = useState<Set<string>>(readReadSet)
  const [tab, setTab] = useState<'all' | 'unread'>('all')

  const lowStockQ = useQuery({
    queryKey: ['notif', 'lowStock'],
    queryFn: async () =>
      (await api.get<Paginated<Product>>('/products', { params: { limit: 100, lowStock: 'true' } }))
        .data.data,
    enabled: canProducts && prefs.lowStock,
  })
  const draftQ = useQuery({
    queryKey: ['notif', 'drafts'],
    queryFn: async () =>
      (await api.get<Paginated<Challan>>('/challans', { params: { limit: 100, status: 'DRAFT' } }))
        .data.data,
    enabled: canCRM && prefs.draftChallans,
  })
  const leadsQ = useQuery({
    queryKey: ['notif', 'leads'],
    queryFn: async () =>
      (await api.get<Paginated<Customer>>('/customers', { params: { limit: 100, status: 'LEAD' } }))
        .data.data,
    enabled: canCRM && prefs.followUps,
  })
  const logsQ = useQuery({
    queryKey: ['notif', 'stockLogs'],
    queryFn: async () =>
      (await api.get<Paginated<StockLog>>('/stock-logs', { params: { limit: 12 } })).data.data,
    enabled: canLedger && prefs.stockActivity,
  })

  const notifs = useMemo<Notif[]>(() => {
    const out: Notif[] = []

    for (const p of lowStockQ.data ?? []) {
      const out_of = p.stockQuantity <= 0
      out.push({
        id: `ls-${p.id}`,
        severity: out_of ? 'error' : 'warning',
        icon: 'inventory_2',
        title: out_of ? 'Out of stock' : 'Low stock',
        body: `${p.name} (${p.sku}) — ${p.stockQuantity} left · min ${p.minStock}`,
        time: p.updatedAt,
        to: '/products',
      })
    }
    for (const c of draftQ.data ?? []) {
      out.push({
        id: `dc-${c.id}`,
        severity: 'info',
        icon: 'pending_actions',
        title: 'Challan awaiting confirmation',
        body: `${c.challanNumber} · ${c.customer?.businessName ?? 'Customer'} · ${money(c.totalAmount)}`,
        time: c.createdAt,
        to: '/challans',
      })
    }
    for (const cust of leadsQ.data ?? []) {
      out.push({
        id: `ld-${cust.id}`,
        severity: 'info',
        icon: 'trending_up',
        title: 'Open lead — follow up',
        body: `${cust.businessName} · ${cust.contactPerson} · ${cust.mobile}`,
        time: cust.updatedAt,
        to: '/customers',
      })
    }
    for (const l of logsQ.data ?? []) {
      out.push({
        id: `sl-${l.id}`,
        severity: 'neutral',
        icon: 'swap_vert',
        title: 'Stock movement',
        body: `${l.product?.sku ?? ''} · ${l.reason} · ${l.quantityChange >= 0 ? '+' : '−'}${Math.abs(l.quantityChange)}`,
        time: l.createdAt,
      })
    }

    return out.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  }, [lowStockQ.data, draftQ.data, leadsQ.data, logsQ.data])

  const unreadCount = notifs.filter((n) => !readSet.has(n.id)).length
  const visible = tab === 'unread' ? notifs.filter((n) => !readSet.has(n.id)) : notifs

  const loading =
    lowStockQ.isLoading || draftQ.isLoading || leadsQ.isLoading || logsQ.isLoading

  function persist(next: Set<string>) {
    setReadSet(new Set(next))
    try {
      localStorage.setItem(READ_KEY, JSON.stringify([...next]))
    } catch {
      // best-effort
    }
  }
  function markRead(id: string) {
    const next = new Set(readSet)
    next.add(id)
    persist(next)
  }
  function markAllRead() {
    const next = new Set(readSet)
    notifs.forEach((n) => next.add(n.id))
    persist(next)
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Operational alerts derived live from inventory, sales and CRM activity."
        actions={
          <Button variant="secondary" size="sm" icon="done_all" onClick={markAllRead} disabled={unreadCount === 0}>
            Mark all read
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        {(['all', 'unread'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-body-sm font-medium capitalize transition-colors',
              tab === t
                ? 'bg-surface-container-highest text-on-surface'
                : 'text-on-surface-variant hover:bg-surface-container-high',
            )}
          >
            {t}
            {t === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 rounded-full bg-secondary-container/40 px-1.5 font-data-mono text-[10px] text-secondary">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto text-body-sm text-on-surface-variant">
          Streams configured in{' '}
          <Link to="/settings" className="text-secondary hover:underline">
            Settings
          </Link>
        </span>
      </div>

      <Card className="p-2">
        {loading ? (
          <LoadingState label="Gathering alerts…" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="notifications_off"
            title={tab === 'unread' ? "You're all caught up" : 'No notifications'}
            hint={
              tab === 'unread'
                ? 'No unread alerts right now.'
                : 'Alerts appear here when stock runs low, challans await confirmation, or leads need follow-up.'
            }
          />
        ) : (
          <ul className="divide-y divide-outline-variant/10">
            {visible.map((n) => {
              const isRead = readSet.has(n.id)
              const Row = (
                <div className="flex items-start gap-3 px-3 py-3">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', SEVERITY_STYLE[n.severity])}>
                    <Icon name={n.icon} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />}
                      <p className={cn('truncate text-body-sm', isRead ? 'text-on-surface-variant' : 'font-medium text-on-surface')}>
                        {n.title}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-body-sm text-on-surface-variant">{n.body}</p>
                  </div>
                  <span className="shrink-0 font-data-mono text-data-mono text-on-surface-variant/70">
                    {relativeTime(n.time)}
                  </span>
                </div>
              )
              return (
                <li
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={cn(
                    'cursor-pointer rounded-lg transition-colors hover:bg-surface-container-high',
                    !isRead && 'bg-surface-container-low',
                  )}
                >
                  {n.to ? (
                    <Link to={n.to} className="block">
                      {Row}
                    </Link>
                  ) : (
                    Row
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
