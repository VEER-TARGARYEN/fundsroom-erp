import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, API_BASE_URL } from './client'
import type { ApiEnvelope } from '@/types/api'

export interface GoogleStatus {
  available: boolean
  encryptionReady: boolean
  connected: boolean
  email: string | null
  picture: string | null
  workspaceReady: boolean
  scopes: string[]
}

/**
 * OAuth start endpoints are top-level browser navigations, not XHR — the
 * browser must follow Google's redirect itself, so these are plain URLs rather
 * than axios calls.
 */
export const googleLoginUrl = (redirect = '/') =>
  `${API_BASE_URL}/auth/google?redirect=${encodeURIComponent(redirect)}`

export function useGoogleStatus(enabled = true) {
  return useQuery({
    queryKey: ['google', 'status'],
    queryFn: async () => (await api.get<ApiEnvelope<GoogleStatus>>('/auth/google/status')).data.data,
    enabled,
    staleTime: 60_000,
  })
}

export function useGoogleDisconnect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => (await api.post('/auth/google/disconnect')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['google'] }),
  })
}

export interface SheetExportResult {
  spreadsheetId: string
  url: string
}

export function useSheetsExport() {
  return useMutation({
    mutationFn: async (opts: { products?: boolean; sales?: boolean } = {}) =>
      (await api.post<ApiEnvelope<SheetExportResult>>('/workspace/sheets/export', opts)).data.data,
  })
}

export interface CalendarSyncResult {
  considered: number
  created: number
  updated: number
  links: string[]
}

export function useCalendarSync() {
  return useMutation({
    mutationFn: async (opts: { days?: number } = {}) =>
      (await api.post<ApiEnvelope<CalendarSyncResult>>('/workspace/calendar/sync-followups', opts))
        .data.data,
  })
}

export function useGmailDigest() {
  return useMutation({
    mutationFn: async (opts: { to?: string } = {}) =>
      (
        await api.post<ApiEnvelope<{ messageId: string; to: string; alerts: number }>>(
          '/workspace/gmail/send-digest',
          opts,
        )
      ).data.data,
  })
}
