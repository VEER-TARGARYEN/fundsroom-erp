import { useRef, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { mapApiError } from '@/lib/errors'
import { useAiStatus, useAskAssistant, type AssistantResponse, type AiTurn } from '@/api/ai.api'

type SentimentTone = 'success' | 'neutral' | 'warning' | 'error'
const SENTIMENT_TONE: Record<AssistantResponse['meta']['sentiment'], SentimentTone> = {
  positive: 'success',
  neutral: 'neutral',
  warning: 'warning',
  critical: 'error',
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  data?: AssistantResponse
}

const STARTERS = [
  'Which products need reordering right now?',
  'Summarise customers due for follow-up.',
  'How are sales tracking this month?',
  'What should I prioritise today?',
]

export function AIPage() {
  const status = useAiStatus()
  const ask = useAskAssistant()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const enabled = status.data?.enabled
  const busy = ask.isPending

  function send(text: string) {
    const message = text.trim()
    if (!message || busy) return
    const history: AiTurn[] = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setDraft('')

    ask.mutate(
      { message, history },
      {
        onSuccess: (data) => {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.answer, data }])
          requestAnimationFrame(() =>
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }),
          )
        },
      },
    )
  }

  return (
    <>
      <PageHeader
        title="AI Assistant"
        subtitle="A copilot grounded in your live inventory, customers and sales."
        actions={
          enabled === false ? (
            <Badge tone="warning" dot>
              AI not configured
            </Badge>
          ) : enabled ? (
            <Badge tone="indigo" dot>
              Grounded in live data
            </Badge>
          ) : null
        }
      />

      <Card className="ai-glow flex h-[calc(100vh-13rem)] flex-col overflow-hidden">
        {/* Conversation */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto scrollbar-thin p-4 sm:p-6">
          {messages.length === 0 && (
            <EmptyState onPick={send} disabled={!enabled || busy} configured={enabled} />
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-body-md text-on-primary">
                  {m.content}
                </div>
              </div>
            ) : (
              <AssistantBubble key={i} data={m.data!} onSuggestion={send} disabled={busy} />
            ),
          )}

          {busy && (
            <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
              <Icon name="progress_activity" size={18} className="animate-spin text-secondary" />
              Nexus is analysing your live data…
            </div>
          )}

          {ask.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 text-body-sm text-error">
              <Icon name="error" size={16} />
              {mapApiError(ask.error)}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-outline-variant/10 bg-surface-container-low/60 p-3 sm:p-4">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(draft)
                }
              }}
              placeholder={enabled === false ? 'AI is not configured on the server.' : 'Ask about inventory, customers, sales…'}
              disabled={!enabled || busy}
              rows={1}
              className="min-h-[44px] resize-none"
            />
            <Button
              variant="ai"
              icon="send"
              onClick={() => send(draft)}
              loading={busy}
              disabled={!enabled || !draft.trim()}
            >
              Ask
            </Button>
          </div>
          <p className="mt-1.5 px-1 text-label-caps uppercase tracking-wide text-on-surface-variant/50">
            Enter to send · Shift+Enter for a new line
          </p>
        </div>
      </Card>
    </>
  )
}

function EmptyState({
  onPick,
  disabled,
  configured,
}: {
  onPick: (t: string) => void
  disabled: boolean
  configured?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-container/20 text-secondary">
        <Icon name="auto_awesome" size={28} />
      </span>
      <div>
        <h2 className="text-title-md font-medium text-on-surface">How can I help you operate today?</h2>
        <p className="mx-auto mt-1 max-w-md text-body-sm text-on-surface-variant">
          {configured === false
            ? 'Set AI_API_KEY on the server to activate the assistant. Everything else is ready.'
            : 'I read your live inventory, customers and sales before every answer.'}
        </p>
      </div>
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <button
            key={s}
            disabled={disabled}
            onClick={() => onPick(s)}
            className="rounded-lg border border-outline-variant/15 bg-surface-container-low px-3 py-2.5 text-left text-body-sm text-on-surface-variant transition hover:border-secondary/40 hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function AssistantBubble({
  data,
  onSuggestion,
  disabled,
}: {
  data: AssistantResponse
  onSuggestion: (t: string) => void
  disabled: boolean
}) {
  const { meta, context } = data
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-container/25 text-secondary">
        <Icon name="auto_awesome" size={18} />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {/* Metadata badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={SENTIMENT_TONE[meta.sentiment]}>{meta.sentiment}</Badge>
          {meta.tags.map((t) => (
            <Badge key={t} tone="neutral">
              {t}
            </Badge>
          ))}
          <span className="ml-auto flex items-center gap-1 font-mono text-label-caps text-on-surface-variant/60">
            <Icon name="verified" size={13} />
            {Math.round(meta.confidence * 100)}% · ~{meta.readingTimeSec}s
          </span>
        </div>

        {/* Answer */}
        <div className="rounded-2xl rounded-tl-sm bg-surface-container-high px-4 py-3 text-body-md leading-relaxed text-on-surface">
          <div className="whitespace-pre-wrap">{data.answer}</div>
        </div>

        {/* Grounding chips — proof the answer used real data */}
        <div className="flex flex-wrap gap-2 text-label-caps text-on-surface-variant/70">
          <GroundChip icon="inventory_2" label="low stock" value={context.lowStockCount} />
          <GroundChip icon="event_upcoming" label="follow-ups" value={context.followUpsDue} />
          <GroundChip icon="description" label="draft challans" value={context.draftChallans} />
          <GroundChip icon="person_add" label="leads" value={context.leads} />
        </div>

        {/* Follow-up suggestions */}
        {data.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {data.suggestions.map((s) => (
              <button
                key={s}
                disabled={disabled}
                onClick={() => onSuggestion(s)}
                className="inline-flex items-center gap-1.5 rounded-full border border-secondary/25 bg-secondary-container/10 px-3 py-1.5 text-body-sm text-secondary transition hover:bg-secondary-container/25 disabled:opacity-40"
              >
                <Icon name="arrow_forward" size={14} />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GroundChip({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-container-low px-2 py-1">
      <Icon name={icon} size={13} className="text-on-surface-variant/50" />
      <span className="font-mono text-on-surface">{value}</span>
      <span className="uppercase tracking-wide">{label}</span>
    </span>
  )
}
