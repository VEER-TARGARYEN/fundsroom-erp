import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import { navForRole, type NavItem } from '@/config/navigation'
import { Icon } from '@/components/ui/Icon'
import { LoadingState } from '@/components/ui/states'
import { useUnreadCount } from '@/api/notifications.api'
import { CommandPalette } from './CommandPalette'

const SECTION_LABEL: Record<NavItem['section'], string> = {
  main: 'Operations',
  ai: 'Intelligence',
  system: 'Workspace',
}

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { data: unread = 0 } = useUnreadCount()
  const location = useLocation()
  const reduceMotion = useReducedMotion()

  const items = user ? navForRole(user.role) : []
  const sections: NavItem['section'][] = ['main', 'ai', 'system']

  // ⌘K / Ctrl+K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-outline-variant/10 bg-surface-container-low transition-transform duration-300 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-3 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-on-primary">
            <Icon name="deployed_code" size={20} />
          </div>
          <span className="text-title-md font-medium tracking-tight text-on-surface">Nexus Core</span>
        </div>

        <nav className="scrollbar-none flex-1 space-y-6 overflow-y-auto px-3 py-2">
          {sections.map((section) => {
            const secItems = items.filter((i) => i.section === section)
            if (secItems.length === 0) return null
            return (
              <div key={section}>
                <p className="px-3 pb-2 font-label-caps text-label-caps uppercase text-on-surface-variant/60">
                  {SECTION_LABEL[section]}
                </p>
                <div className="space-y-1">
                  {secItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-md transition-all',
                          isActive
                            ? 'bg-surface-container-highest text-primary'
                            : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                          item.section === 'ai' && !isActive && 'text-secondary/90 hover:text-secondary',
                        )
                      }
                    >
                      <Icon name={item.icon} size={20} className={item.section === 'ai' ? 'animate-pulse' : ''} />
                      <span className="flex-1">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="p-4">
          <div className="flex items-center gap-3 rounded-xl border border-outline-variant/20 bg-surface-container p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary">
              <span className="text-body-sm font-semibold">{initials(user?.name)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm text-on-surface">{user?.name}</p>
              <p className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant">
                {user?.role}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void logout()
                navigate('/login')
              }}
              className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              aria-label="Sign out"
              title="Sign out"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-outline-variant/10 bg-background/80 px-4 backdrop-blur-xl lg:px-margin-desktop">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high lg:hidden"
            aria-label="Open navigation"
          >
            <Icon name="menu" size={20} />
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 max-w-xl flex-1 items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 text-body-sm text-on-surface-variant transition-colors hover:border-outline-variant/40"
          >
            <Icon name="search" size={18} />
            <span className="flex-1 text-left">Search or run a command…</span>
            <span className="hidden items-center gap-0.5 rounded border border-outline-variant/30 bg-surface-container px-1.5 py-0.5 font-data-mono text-[10px] sm:flex">
              <span className="text-[12px]">⌘</span>K
            </span>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className="relative rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              aria-label="Notifications"
            >
              <Icon name="notifications" size={20} />
              {/* Real unread count, polled — a scheduled scan surfaces here
                  without the user having to reload. */}
              <AnimatePresence>
                {unread > 0 && (
                  <m.span
                    // Re-keyed on the count so a newly-arrived alert pops
                    // rather than silently swapping the number.
                    key={unread}
                    className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 font-data-mono text-[10px] font-semibold text-on-error ring-2 ring-background"
                    initial={reduceMotion ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
                    animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                  >
                    {unread > 99 ? '99+' : unread}
                  </m.span>
                )}
              </AnimatePresence>
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              aria-label="Settings"
            >
              <Icon name="settings" size={20} />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-margin-desktop lg:py-8">
          {/* Route chunks stream in here; the shell around it stays put.
              Keying on pathname gives each route its own enter transition;
              mode="wait" avoids the outgoing and incoming pages overlapping. */}
          <Suspense fallback={<LoadingState />}>
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={location.pathname}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <Outlet />
              </m.div>
            </AnimatePresence>
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={items} />
    </div>
  )
}

function initials(name?: string): string {
  if (!name) return '—'
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
