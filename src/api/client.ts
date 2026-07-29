import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import { getAccessToken, setAccessToken } from './tokenStore'
import type { ApiError } from '@/types/api'

export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/api'

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

/** Called when refresh fails — AuthContext registers this to force a logout. */
let authFailureHandler: (() => void) | null = null
export function setAuthFailureHandler(cb: (() => void) | null): void {
  authFailureHandler = cb
}

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // send/receive the HttpOnly refresh cookie
  headers: { 'Content-Type': 'application/json' },
})

// Attach the in-memory access token to every request.
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Single-flight refresh so concurrent 401s trigger only one /auth/refresh call.
let refreshPromise: Promise<string> | null = null
function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ accessToken: string }>(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((r) => r.data.accessToken)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

function isAuthPath(url?: string): boolean {
  return !!url && (url.includes('/auth/login') || url.includes('/auth/refresh'))
}

function normalizeError(error: AxiosError): ApiError {
  const resp = error.response
  const body = resp?.data as { error?: { code?: string; message?: string; details?: unknown } } | undefined
  if (!resp) {
    return {
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Cannot reach the server. Please check your connection or that the API is running.',
    }
  }
  return {
    status: resp.status,
    code: body?.error?.code ?? 'UNKNOWN',
    message: body?.error?.message ?? error.message,
    details: body?.error?.details,
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined

    // Transparently refresh the access token once on a 401.
    if (error.response?.status === 401 && original && !original._retry && !isAuthPath(original.url)) {
      original._retry = true
      try {
        const newToken = await refreshAccessToken()
        setAccessToken(newToken)
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch {
        setAccessToken(null)
        authFailureHandler?.()
      }
    }
    return Promise.reject(normalizeError(error))
  },
)
