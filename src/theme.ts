import { useCallback, useEffect, useState } from 'react'

/**
 * Runtime theme switching. Persisted to localStorage and applied via
 * `document.documentElement.dataset.theme`, which every color in
 * tailwind.config.js resolves through (see src/theme.css for the actual
 * variable values). Same-tab updates broadcast a synthetic `storage` event,
 * matching the pattern in features/settings/prefs.ts.
 *
 * The theme id list is duplicated in index.html's pre-paint script (so the
 * correct theme applies before first paint, avoiding a flash) — both must
 * stay in sync when a theme is added or removed.
 */
export type ThemeId = 'nexus' | 'meadow' | 'abyss' | 'ember'

export interface ThemeMeta {
  id: ThemeId
  label: string
  description: string
  /** True for themes with a light background — drives the preview card's own text color. */
  light: boolean
  /** A handful of the theme's actual token values, for rendering a swatch without loading the theme. */
  swatch: { background: string; surface: string; primary: string; secondary: string }
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'nexus',
    label: 'Nexus',
    description: 'The original palette — charcoal surfaces, Electric Indigo accent.',
    light: false,
    swatch: { background: '#101417', surface: '#181c20', primary: '#ffffff', secondary: '#c0c1ff' },
  },
  {
    id: 'meadow',
    label: 'Meadow',
    description: 'Light theme — forest green primary, violet accent, warm paper neutrals.',
    light: true,
    swatch: { background: '#fcfcf8', surface: '#f6f6ee', primary: '#336600', secondary: '#9900cc' },
  },
  {
    id: 'abyss',
    label: 'Abyss',
    description: 'Dark theme — sky-blue primary, mint accent, a navy undertone in the surfaces.',
    light: false,
    swatch: { background: '#0f0f1f', surface: '#151528', primary: '#3399cc', secondary: '#00ffcc' },
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Dark theme — violet primary, brick-red accent. Bolder, jewel-toned.',
    light: false,
    swatch: { background: '#1c141f', surface: '#241b28', primary: '#dc8ef6', secondary: '#df9b9b' },
  },
]

const VALID_IDS = new Set(THEMES.map((t) => t.id))
const KEY = 'fundsroom.theme.v1'
const DEFAULT: ThemeId = 'nexus'

export function readTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(KEY)
    return raw && VALID_IDS.has(raw as ThemeId) ? (raw as ThemeId) : DEFAULT
  } catch {
    return DEFAULT
  }
}

function apply(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
}

export function useTheme(): [ThemeId, (theme: ThemeId) => void] {
  const [theme, setTheme] = useState<ThemeId>(readTheme)

  // The pre-paint inline script in index.html already applied the saved
  // theme before mount; this just keeps React's state in sync with it.
  useEffect(() => {
    apply(theme)
  }, [theme])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === KEY) setTheme(readTheme())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((next: ThemeId) => {
    setTheme(next)
    apply(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // ignore quota / serialization errors — theme choice is best-effort
    }
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
  }, [])

  return [theme, update]
}
