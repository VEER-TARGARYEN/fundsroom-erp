import { useState } from 'react'
import { API_BASE_URL } from '@/api/client'
import {
  useGoogleStatus,
  useGoogleDisconnect,
  useSheetsExport,
  useCalendarSync,
  useGmailDigest,
} from '@/api/google.api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/states'
import { GoogleMark } from '@/components/GoogleButton'
import { mapApiError } from '@/lib/errors'
import { useToast } from '@/components/feedback/ToastContext'

/**
 * Connect/disconnect plus the three Workspace actions.
 *
 * Connecting is an anchor, not a fetch: Google's consent screen is a top-level
 * navigation. That means no bearer token can be attached, so the backend
 * re-identifies the user from the verified Google profile in the callback —
 * `intent=connect` only changes which scopes are requested.
 */
export function GoogleWorkspacePanel() {
  const status = useGoogleStatus()
  const disconnect = useGoogleDisconnect()
  const sheets = useSheetsExport()
  const calendar = useCalendarSync()
  const gmail = useGmailDigest()
  const toast = useToast()

  const [sheetUrl, setSheetUrl] = useState<string | null>(null)

  const s = status.data

  if (status.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-9 w-40" />
      </div>
    )
  }

  if (!s?.available) {
    return (
      <p className="text-body-sm text-on-surface-variant">
        Google integration isn’t configured on the server. Set{' '}
        <span className="font-mono text-on-surface">GOOGLE_CLIENT_ID</span> and{' '}
        <span className="font-mono text-on-surface">GOOGLE_CLIENT_SECRET</span> to enable it.
      </p>
    )
  }

  // intent=connect additionally requests the Sheets/Calendar/Gmail scopes.
  const connectHref = `${API_BASE_URL}/auth/google?intent=connect&redirect=${encodeURIComponent('/settings')}`

  async function run(label: string, fn: () => Promise<unknown>, onOk?: (r: unknown) => void) {
    try {
      const r = await fn()
      onOk?.(r)
      toast.push({ tone: 'success', title: `${label} finished` })
    } catch (err) {
      toast.push({ tone: 'error', title: `${label} failed`, description: mapApiError(err) })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant/15 bg-surface-container-low px-3 py-2.5">
        <GoogleMark size={20} />
        <div className="min-w-0 flex-1">
          {s.connected ? (
            <>
              <p className="truncate text-body-sm text-on-surface">{s.email}</p>
              <p className="text-body-sm text-on-surface-variant">
                {s.workspaceReady ? 'All permissions granted' : 'Some permissions missing'}
              </p>
            </>
          ) : (
            <p className="text-body-sm text-on-surface-variant">Not connected</p>
          )}
        </div>
        {s.connected ? (
          <Badge tone={s.workspaceReady ? 'success' : 'warning'} dot>
            {s.workspaceReady ? 'Ready' : 'Limited'}
          </Badge>
        ) : (
          <Badge tone="neutral">Off</Badge>
        )}
      </div>

      {!s.encryptionReady && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-body-sm text-warning">
          <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-mono">TOKEN_ENC_KEY</span> is not set, so Google tokens can’t be
            stored securely. Connecting is disabled until it is.
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {s.connected ? (
          <>
            <a href={connectHref}>
              <Button variant="secondary" size="sm" icon="refresh">
                {s.workspaceReady ? 'Reconnect' : 'Grant permissions'}
              </Button>
            </a>
            <Button
              variant="ghost"
              size="sm"
              icon="link_off"
              loading={disconnect.isPending}
              onClick={() =>
                void run('Disconnect', () => disconnect.mutateAsync(), () => setSheetUrl(null))
              }
            >
              Disconnect
            </Button>
          </>
        ) : (
          <a href={s.encryptionReady ? connectHref : undefined} aria-disabled={!s.encryptionReady}>
            <Button size="sm" icon="link" disabled={!s.encryptionReady}>
              Connect Google
            </Button>
          </a>
        )}
      </div>

      {s.connected && (
        <div className="space-y-2 border-t border-outline-variant/10 pt-4">
          <p className="font-label-caps text-label-caps uppercase text-on-surface-variant/70">
            Workspace actions
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="table_chart"
              loading={sheets.isPending}
              onClick={() =>
                void run('Sheets export', () => sheets.mutateAsync({}), (r) =>
                  setSheetUrl((r as { url: string }).url),
                )
              }
            >
              Export to Sheets
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon="event"
              loading={calendar.isPending}
              onClick={() => void run('Calendar sync', () => calendar.mutateAsync({ days: 30 }))}
            >
              Sync follow-ups
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon="mail"
              loading={gmail.isPending}
              onClick={() => void run('Gmail digest', () => gmail.mutateAsync({}))}
            >
              Email alerts via Gmail
            </Button>
          </div>

          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-body-sm text-secondary hover:underline"
            >
              <Icon name="open_in_new" size={15} /> Open the exported spreadsheet
            </a>
          )}

          {calendar.isSuccess && calendar.data && (
            <p className="text-body-sm text-on-surface-variant">
              {calendar.data.created} created · {calendar.data.updated} updated · from{' '}
              {calendar.data.considered} due follow-ups.
            </p>
          )}

          {gmail.isSuccess && gmail.data && (
            <p className="text-body-sm text-on-surface-variant">
              Sent {gmail.data.alerts} alerts to {gmail.data.to}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
