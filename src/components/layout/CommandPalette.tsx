import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/ui/Icon'
import type { NavItem } from '@/config/navigation'

interface Command {
  id: string
  label: string
  icon: string
  hint?: string
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  items: NavItem[]
}

export function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path)
      onClose()
    }
    const quick: Command[] = []
    if (items.some((i) => i.path === '/customers'))
      quick.push({ id: 'new-customer', label: 'New Customer', icon: 'person_add', hint: 'Create', run: go('/customers?new=1') })
    if (items.some((i) => i.path === '/products'))
      quick.push({ id: 'new-product', label: 'New Product', icon: 'add_box', hint: 'Create', run: go('/products?new=1') })
    if (items.some((i) => i.path === '/challans'))
      quick.push({ id: 'new-challan', label: 'New Sales Challan', icon: 'note_add', hint: 'Create', run: go('/challans?new=1') })
    const nav: Command[] = items.map((i) => ({
      id: `go-${i.path}`,
      label: `Go to ${i.label}`,
      icon: i.icon,
      hint: 'Navigate',
      run: go(i.path),
    }))
    return [...quick, ...nav]
  }, [items, navigate, onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => setActive(0), [query])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[active]?.run()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="flex min-h-full items-start justify-center p-4 pt-[12vh]">
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container shadow-glow animate-fade-in"
          onKeyDown={onKeyDown}
        >
          <div className="flex items-center gap-3 border-b border-outline-variant/10 px-4">
            <Icon name="search" size={20} className="text-on-surface-variant" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search commands…  (record search — backend pending)"
              className="h-12 flex-1 bg-transparent text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
            />
            <kbd className="rounded border border-outline-variant/30 bg-surface-container-high px-1.5 py-0.5 font-data-mono text-[10px] text-on-surface-variant">
              esc
            </kbd>
          </div>
          <div className="scrollbar-thin max-h-80 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-body-sm text-on-surface-variant">No matching commands</p>
            ) : (
              filtered.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={c.run}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                    i === active ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant',
                  )}
                >
                  <Icon name={c.icon} size={18} />
                  <span className="flex-1 text-body-sm">{c.label}</span>
                  {c.hint && <span className="font-data-mono text-[10px] text-on-surface-variant/70">{c.hint}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
