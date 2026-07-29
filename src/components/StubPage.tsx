import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/Badge'

interface StubPageProps {
  title: string
  subtitle: string
  icon: string
  /** What this screen will do once the backend endpoints exist. */
  planned: string[]
}

/**
 * Clean, stable placeholder for Stitch screens whose backend endpoints don't
 * exist yet (AI, Notifications, Reports, Settings). Renders real UI chrome and
 * clearly labels the module "Backend Pending" — never a runtime error.
 */
export function StubPage({ title, subtitle, icon, planned }: StubPageProps) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Card className="ai-glow relative overflow-hidden">
        <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-container/20 text-secondary">
            <Icon name={icon} size={28} />
          </span>
          <div>
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-title-md font-medium text-on-surface">{title}</h2>
              <Badge tone="indigo">Backend Pending</Badge>
            </div>
            <p className="mx-auto mt-2 max-w-md text-body-sm text-on-surface-variant">
              The UI is in place. This module activates once its API endpoints are available.
            </p>
          </div>
          <ul className="w-full max-w-sm space-y-1.5 text-left">
            {planned.map((p) => (
              <li key={p} className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-body-sm text-on-surface-variant">
                <Icon name="check_circle" size={16} className="text-on-surface-variant/50" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </>
  )
}
