import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { authApi } from '@/api/auth.api'
import { setAccessToken } from '@/api/tokenStore'
import { setAuthFailureHandler } from '@/api/client'
import type { AuthUser } from '@/types/api'

type Status = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  user: AuthUser | null
  status: Status
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  const clearSession = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  // Restore the session on load using the HttpOnly refresh cookie.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { accessToken } = await authApi.refresh()
        setAccessToken(accessToken)
        const me = await authApi.me()
        if (active) {
          setUser(me)
          setStatus('authenticated')
        }
      } catch {
        if (active) clearSession()
      }
    })()
    return () => {
      active = false
    }
  }, [clearSession])

  // If a mid-session refresh fails, drop to the login screen.
  useEffect(() => {
    setAuthFailureHandler(() => {
      setUser(null)
      setStatus('unauthenticated')
    })
    return () => setAuthFailureHandler(null)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password)
    setAccessToken(res.accessToken)
    setUser(res.user)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore — clear locally regardless
    }
    clearSession()
  }, [clearSession])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout }),
    [user, status, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
