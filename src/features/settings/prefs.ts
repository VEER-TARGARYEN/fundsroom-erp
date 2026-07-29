import { useCallback, useEffect, useState } from 'react'

/**
 * Notification preferences — persisted to localStorage and shared between the
 * Settings page (which edits them) and the Notifications page (which reads them
 * to decide which alert streams to surface). Same-tab updates are broadcast via
 * a synthetic `storage` event so both pages stay in sync without a backend.
 */
export interface NotificationPrefs {
  lowStock: boolean
  draftChallans: boolean
  followUps: boolean
  stockActivity: boolean
}

const KEY = 'fundsroom.prefs.v1'

const DEFAULTS: NotificationPrefs = {
  lowStock: true,
  draftChallans: true,
  followUps: true,
  stockActivity: true,
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
