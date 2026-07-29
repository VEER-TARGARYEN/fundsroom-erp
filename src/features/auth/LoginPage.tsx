import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { mapApiError } from '@/lib/errors'

interface LocationState {
  from?: { pathname?: string }
}

export function LoginPage() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('admin@fundsroom.in')
  const [password, setPassword] = useState('Password@123')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'authenticated') {
    const to = (location.state as LocationState | null)?.from?.pathname ?? '/'
    return <Navigate to={to} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      const to = (location.state as LocationState | null)?.from?.pathname ?? '/'
      navigate(to, { replace: true })
    } catch (err) {
      setError(mapApiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Ambient AI glow */}
      <div className="pointer-events-none absolute inset-0 ai-glow" />
      <div className="absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-secondary-container/10 blur-[120px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-on-primary">
            <Icon name="deployed_code" size={26} />
          </div>
          <div>
            <h1 className="text-headline-sm font-medium text-on-surface">Nexus Core</h1>
            <p className="mt-1 text-body-sm text-on-surface-variant">Fundsroom ERP · sign in to continue</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-xl border border-outline-variant/15 bg-surface-container p-6 shadow-card"
        >
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2.5 text-body-sm text-error">
              <Icon name="error" size={18} className="mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@fundsroom.in"
              required
            />
          </Field>

          <Field label="Password" htmlFor="password" required>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-on-surface-variant hover:text-on-surface"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPw ? 'visibility_off' : 'visibility'} size={18} />
              </button>
            </div>
          </Field>

          <Button type="submit" loading={submitting} className="w-full" icon="login">
            Sign in
          </Button>

          <div className="rounded-lg border border-outline-variant/10 bg-surface-container-low px-3 py-2.5">
            <p className="font-label-caps text-label-caps uppercase text-on-surface-variant/70">Demo accounts · Password@123</p>
            <p className="mt-1 font-mono text-data-mono text-on-surface-variant">
              admin@ · sales@ · warehouse@ · accounts@fundsroom.in
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
