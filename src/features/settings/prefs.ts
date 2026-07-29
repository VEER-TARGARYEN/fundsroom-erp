import { useCallback, useEffect, useState } from 'react'

/**
 * Which alert streams the user wants to see. Persisted to localStorage and
 * shared between Settings (which edits them) and Notifications (which turns
 * them into a server-side `types` filter). Same-tab updates are broadcast via a
 * synthetic `storage` event so both pages stay in sync.
 */
export interface NotificationPrefs {
  lowStock: boolean
  draftChallans: boolean
  followUps: boolean
}

/** Alert types each preference controls, matching the server enum. */
export const PREF_TYPES: Record<keyof NotificationPrefs, string[]> = {
  lowStock: ['OUT_OF_STOCK', 'LOW_STOCK'],
  draftChallans: ['DRAFT_STALE'],
  followUps: ['FOLLOW_UP_DUE'],
}

/**
 * Build the `types` query value. Returns undefined when everything is enabled
 * so the common case sends no filter at all.
 */
export function typesFilter(prefs: NotificationPrefs): string | undefined {
  const keys = Object.keys(PREF_TYPES) as (keyof NotificationPrefs)[]
  if (keys.every((k) => prefs[k])) return undefined
  const types = keys.filter((k) => prefs[k]).flatMap((k) => PREF_TYPES[k])
  // Nothing enabled: send a sentinel so the server returns an empty page
  // rather than silently falling back to "no filter".
  return types.length ? types.join(',') : 'NONE'
}

// v2: the old shape had a `stockActivity` key that no longer maps to anything.
const KEY = 'fundsroom.prefs.v2'

const DEFAULTS: NotificationPrefs = {
  lowStock: true,
  draftChallans: true,
  followUps: true,
}

export function readPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) }
  } catch {
    return DEFAULTS
  }
}

export function usePrefs(): [NotificationPrefs, (patch: Partial<NotificationPrefs>) => void] {
  const [prefs, setPrefs] = useState<NotificationPrefs>(readPrefs)

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === KEY) setPrefs(readPrefs())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((patch: Partial<NotificationPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // ignore quota / serialization errors — prefs are best-effort
      }
      // storage events don't fire in the tab that wrote them; broadcast manually.
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
      return next
    })
  }, [])

  return [prefs, update]
}
