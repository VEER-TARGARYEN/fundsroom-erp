import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/ui/Icon'

type Tone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  title: string
  description?: string
  tone: Tone
}

interface ToastContextValue {
  push: (t: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TONE: Record<Tone, { icon: string; color: string }> = {
  success: { icon: 'check_circle', color: 'text-success' },
  error: { icon: 'error', color: 'text-error' },
  info: { icon: 'info', color: 'text-secondary' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), [])
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++counter.current
      setToasts((p) => [...p, { ...t, id }])
      window.setTimeout(() => dismiss(id), 4500)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="animate-slide-in-right flex items-start gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 py-3 shadow-glow"
            >
              <Icon name={TONE[t.tone].icon} size={20} className={cn('mt-0.5', TONE[t.tone].color)} />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-medium text-on-surface">{t.title}</p>
                {t.description && <p className="mt-0.5 text-data-mono text-on-surface-variant">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded p-0.5 text-on-surface-variant hover:text-on-surface"
                aria-label="Dismiss"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}
