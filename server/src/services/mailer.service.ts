import { env } from '../config/env'
import { logger } from '../config/logger'
import type { DetectedAlert } from './agent.service'

/**
 * Email delivery via Resend's HTTP API.
 *
 * Uses global fetch rather than an SDK — it is one POST, and avoiding a
 * dependency keeps the Render free-tier install lean. Delivery is best-effort:
 * a failure is logged and reported, never thrown, so a mail outage can't fail
 * the agent scan that produced the alerts.
 */
export const mailEnabled = Boolean(env.RESEND_API_KEY && env.ALERT_EMAIL_TO)

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#dc2626',
  WARNING: '#d97706',
  INFO: '#6366f1',
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

function buildHtml(p: {
  alerts: DetectedAlert[]
  digest: string | null
  created: number
  resolved: number
  byType: Record<string, number>
}): string {
  const order = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const
  const top = [...p.alerts]
    .sort((a, b) => order[a.severity] - order[b.severity])
    .slice(0, 20)

  const rows = top
    .map(
      (a) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap">
          <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;color:#fff;background:${SEVERITY_COLOR[a.severity]}">${a.severity}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb">
          <div style="font-weight:600;color:#111827;font-size:14px">${esc(a.title)}</div>
          <div style="color:#4b5563;font-size:13px;margin-top:2px">${esc(a.body)}</div>
        </td>
      </tr>`,
    )
    .join('')

  const counts = Object.entries(p.byType)
    .map(([k, v]) => `${v} ${k.replace(/_/g, ' ').toLowerCase()}`)
    .join(' · ')

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="padding:20px 24px;background:#101417;color:#fff">
      <div style="font-size:18px;font-weight:600">Fundsroom ERP — Operations Alert</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:4px">${esc(counts) || 'No open alerts'}</div>
    </div>
    ${
      p.digest
        ? `<div style="padding:18px 24px;background:#f5f3ff;border-bottom:1px solid #e5e7eb">
             <div style="font-size:12px;font-weight:700;letter-spacing:.05em;color:#6366f1;text-transform:uppercase">AI Briefing</div>
             <div style="margin-top:8px;color:#1f2937;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(p.digest)}</div>
           </div>`
        : ''
    }
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    ${
      p.alerts.length > top.length
        ? `<div style="padding:12px 24px;color:#6b7280;font-size:13px">+ ${p.alerts.length - top.length} more in the app.</div>`
        : ''
    }
    <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">
      ${p.created} new · ${p.resolved} resolved since the last scan.
      ${env.APP_URL ? `<a href="${esc(env.APP_URL)}/notifications" style="color:#6366f1;text-decoration:none">Open Notifications →</a>` : ''}
    </div>
  </div>
</body></html>`
}

export async function sendAlertEmail(p: {
  alerts: DetectedAlert[]
  digest: string | null
  created: number
  resolved: number
  byType: Record<string, number>
}): Promise<boolean> {
  if (!mailEnabled) {
    logger.info('agent: email skipped (RESEND_API_KEY / ALERT_EMAIL_TO not set)')
    return false
  }

  const critical = p.alerts.filter((a) => a.severity === 'CRITICAL').length
  const subject =
    critical > 0
      ? `[Fundsroom] ${critical} critical · ${p.created} new alert${p.created === 1 ? '' : 's'}`
      : `[Fundsroom] ${p.created} new alert${p.created === 1 ? '' : 's'}`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.ALERT_EMAIL_FROM,
        to: env.ALERT_EMAIL_TO!.split(',').map((s) => s.trim()).filter(Boolean),
        subject,
        html: buildHtml(p),
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      logger.warn({ status: res.status, body: await res.text() }, 'agent: email send failed')
      return false
    }
    logger.info({ subject }, 'agent: alert email sent')
    return true
  } catch (err) {
    logger.warn({ err }, 'agent: email send threw')
    return false
  }
}
