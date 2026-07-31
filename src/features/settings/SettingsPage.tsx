import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { API_BASE_URL } from '@/api/client'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { usePrefs, type NotificationPrefs } from '@/features/settings/prefs'
import { GoogleWorkspacePanel } from './GoogleWorkspacePanel'
import { cn } from '@/lib/utils'
import { useTheme, THEMES } from '@/theme'
import type { Role } from '@/types/api'

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrator',
  SALES: 'Sales Executive',
  WAREHOUSE: 'Warehouse',
  ACCOUNTS: 'Accounts',
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-on-surface">{label}</p>
        {hint && <p className="mt-0.5 text-body-sm text-on-surface-variant">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40',
          checked ? 'bg-secondary' : 'bg-surface-container-highest',
        )}
      >
        <span
          className={cn(
            // `left-0.5` anchors the thumb to the track's left edge — without
            // an explicit `left`, an absolutely positioned element sits at its
            // *static* position, which a <button> centers, so `translate-x-5`
            // pushed the thumb past the track's right edge in every theme.
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow transition-transform',
            // Thumb colors come from tokens so every theme keeps ≥3:1 against
            // its own track: on-secondary vs the secondary ON track, and
            // on-surface-variant vs the surface-container-highest OFF track
            // (a hardcoded white thumb vanished on Meadow's light gray track).
            checked ? 'translate-x-5 bg-on-secondary' : 'translate-x-0 bg-on-surface-variant',
          )}
        />
      </button>
    </div>
  )
}

/**
 * Each swatch previews its OWN theme's colors regardless of which theme is
 * currently active, so inline styles are the correct tool here — the whole
 * point is to show a palette the page isn't rendering in right now.
 */
function ThemeSwatch({
  meta,
  selected,
  onSelect,
}: {
  meta: (typeof THEMES)[number]
  selected: boolean
  onSelect: () => void
}) {
  const { background, surface, primary, secondary } = meta.swatch
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40',
        selected
          ? 'border-secondary ring-1 ring-secondary'
          : 'border-outline-variant/20 hover:border-outline-variant/40',
      )}
    >
      <div className="h-16 w-full" style={{ background }}>
        <div className="flex h-full items-end gap-1.5 p-2.5">
          <span className="h-5 w-5 rounded-full" style={{ background: primary }} />
          <span className="h-5 w-5 rounded-full" style={{ background: secondary }} />
          <span className="ml-auto h-8 flex-1 rounded-md" style={{ background: surface }} />
        </div>
      </div>
      <div className="bg-surface-container-low p-3">
        <div className="flex items-center gap-1.5">
          <p className="text-body-sm font-medium text-on-surface">{meta.label}</p>
          {selected && <Icon name="check_circle" size={15} className="text-secondary" />}
        </div>
        <p className="mt-0.5 text-body-sm text-on-surface-variant">{meta.description}</p>
      </div>
    </button>
  )
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-highest text-on-surface-variant">
          <Icon name={icon} size={18} />
        </span>
        <div>
          <h2 className="text-title-md font-medium text-on-surface">{title}</h2>
          {subtitle && <p className="text-body-sm text-on-surface-variant">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}

const PREF_META: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: 'lowStock', label: 'Stock alerts', hint: 'Products at or below minimum, and stockouts.' },
  { key: 'draftChallans', label: 'Unconfirmed challans', hint: 'Challans left in draft for more than 3 days.' },
  { key: 'followUps', label: 'Customer follow-ups', hint: 'Follow-up dates that are due or overdue.' },
]

export function SettingsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [prefs, updatePrefs] = usePrefs()
  const [theme, setTheme] = useTheme()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Profile, notification preferences, security and workspace." />

      {/* Appearance */}
      <SectionCard
        icon="palette"
        title="Appearance"
        subtitle="Pick a theme. Applies instantly and everywhere, no reload needed."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => (
            <ThemeSwatch key={t.id} meta={t} selected={theme === t.id} onSelect={() => setTheme(t.id)} />
          ))}
        </div>
      </SectionCard>

      <div className="mt-6 grid grid-cols-1 gap-gutter lg:grid-cols-2">
        {/* Profile */}
        <SectionCard icon="account_circle" title="Profile" subtitle="Your account identity.">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-container/30 text-title-md font-medium text-secondary">
              {initials(user!.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-body-md font-medium text-on-surface">{user!.name}</p>
              <p className="truncate text-body-sm text-on-surface-variant">{user!.email}</p>
              <Badge tone="indigo" className="mt-1.5">
                {ROLE_LABEL[user!.role]}
              </Badge>
            </div>
          </div>
        </SectionCard>

        {/* Notification preferences */}
        <SectionCard
          icon="tune"
          title="Notification preferences"
          subtitle="Which alert streams the agent surfaces to you."
        >
          <div className="divide-y divide-outline-variant/10">
            {PREF_META.map((m) => (
              <Toggle
                key={m.key}
                label={m.label}
                hint={m.hint}
                checked={prefs[m.key]}
                onChange={(v) => updatePrefs({ [m.key]: v })}
              />
            ))}
          </div>
        </SectionCard>

        {/* Google Workspace */}
        <SectionCard
          icon="cloud_sync"
          title="Google Workspace"
          subtitle="Export to Sheets, sync follow-ups to Calendar, send from Gmail."
        >
          <GoogleWorkspacePanel />
        </SectionCard>

        {/* Security */}
        <SectionCard icon="security" title="Security" subtitle="Session and access.">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2.5">
              <span className="text-body-sm text-on-surface-variant">Session</span>
              <span className="flex items-center gap-1.5 text-body-sm text-on-surface">
                <span className="h-2 w-2 rounded-full bg-success" /> Active
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2.5">
              <span className="text-body-sm text-on-surface-variant">Auth method</span>
              <span className="text-body-sm text-on-surface">JWT · HttpOnly refresh cookie</span>
            </div>
            <p className="text-body-sm text-on-surface-variant">
              Access tokens are held in memory and rotated automatically; the refresh token lives in a
              secure HttpOnly cookie.
            </p>
            <Button variant="danger" size="sm" icon="logout" onClick={handleSignOut} loading={signingOut}>
              Sign out
            </Button>
          </div>
        </SectionCard>

        {/* Workspace / About */}
        <SectionCard icon="workspaces" title="Workspace" subtitle="Environment details.">
          <dl className="space-y-2.5">
            {[
              ['Product', 'Fundsroom ERP — Nexus Core'],
              ['Version', 'v1.0.0'],
              ['API endpoint', API_BASE_URL],
              ['Region', 'AWS ap-southeast-1 (Singapore)'],
              ['Database', 'PostgreSQL (Neon)'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-body-sm text-on-surface-variant">{k}</dt>
                <dd className="truncate text-right font-mono text-body-sm text-on-surface">{v}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>
    </>
  )
}
