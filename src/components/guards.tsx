import { Navigate, Outlet, useLocation, Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import type { Role } from '@/types/api'

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-on-surface-variant">
      <div className="flex h-10 w-10 items-center justify-center rounded bg-primary text-on-primary">
        <Icon name="deployed_code" size={24} />
      </div>
      <Icon name="progress_activity" size={24} className="animate-spin text-secondary" />
      <p className="text-body-sm">Restoring your session…</p>
    </div>
  )
}

/**
 * Gate authenticated app routes.
 *
 * Landing on the app root while signed out shows the marketing page rather than
 * the bare sign-in form — the same front door Render and GitHub present. Any
 * deeper URL still goes to /login carrying `from`, so signing in returns the
 * user to the page they actually asked for.
 */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullScreenLoader />
  if (status === 'unauthenticated') {
    return location.pathname === '/' ? (
      <Navigate to="/welcome" replace />
    ) : (
      <Navigate to="/login" state={{ from: location }} replace />
    )
  }
  return <Outlet />
}

/** Route-level RBAC (backend remains authoritative). */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-error/15 text-error">
          <Icon name="lock" size={28} />
        </span>
        <h1 className="text-title-md font-medium text-on-surface">Access restricted</h1>
        <p className="max-w-sm text-body-sm text-on-surface-variant">
          Your role <span className="font-mono text-on-surface">{user?.role}</span> can’t view this module.
        </p>
        <Link to="/">
          <Button variant="secondary" size="sm" icon="arrow_back" className="mt-1">
            Back to dashboard
          </Button>
        </Link>
      </div>
    )
  }
  return <>{children}</>
}

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
        <Icon name="help" size={28} />
      </span>
      <h1 className="text-title-md font-medium text-on-surface">Page not found</h1>
      <Link to="/">
        <Button variant="secondary" size="sm" icon="home">
          Go home
        </Button>
      </Link>
    </div>
  )
}
