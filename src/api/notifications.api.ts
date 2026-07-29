import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from './client'
import type { ApiEnvelope, PaginationMeta } from '@/types/api'

export type NotificationType = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'DRAFT_STALE' | 'FOLLOW_UP_DUE'
export type NotificationSeverity = 'CRITICAL' | 'WARNING' | 'INFO'

export interface Notification {
  id: string
  type: NotificationType
  severity: NotificationSeverity
  title: string
  body: string
  entityId: string | null
  entityRef: string | null
  href: string | null
  readAt: string | null
  createdAt: string
}

export interface ScanResult {
  detected: number
  created: number
  resolved: number
  open: number
  byType: Record<string, number>
  digest: string | null
  emailed: boolean
  durationMs: number
}

export interface AgentStatus {
  scheduleConfigured: boolean
  emailConfigured: boolean
  aiConfigured: boolean
}

interface NotificationPage {
  data: Notification[]
  unread: number
  pagination: PaginationMeta
}

export function useNotifications(params: {
  page?: number
  limit?: number
  unread?: boolean
  /** Comma-separated NotificationType list; omit for everything. */
  types?: string
}) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: async () =>
      (
        await api.get<NotificationPage>('/notifications', {
          params: { ...params, unread: params.unread ? 'true' : undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  })
}

/** Drives the header bell badge; polled so scheduled scans surface on their own. */
export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () =>
      (await api.get<ApiEnvelope<{ unread: number }>>('/notifications/unread-count')).data.data
        .unread,
    refetchInterval: 120_000,
    staleTime: 60_000,
  })
}

export function useAgentStatus() {
  return useQuery({
    queryKey: ['agent', 'status'],
    queryFn: async () => (await api.get<ApiEnvelope<AgentStatus>>('/agent/status')).data.data,
    staleTime: 5 * 60_000,
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['notifications'] })
}

/** Toggles read state — the endpoint flips it, so this also marks unread. */
export function useToggleRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<ApiEnvelope<Notification>>(`/notifications/${id}/read`)).data.data,
    onSuccess: () => invalidate(qc),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      (await api.post<ApiEnvelope<{ updated: number }>>('/notifications/read-all')).data.data,
    onSuccess: () => invalidate(qc),
  })
}

/** Manual ADMIN-only run. Scheduled runs are what send email. */
export function useRunScan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => (await api.post<ApiEnvelope<ScanResult>>('/agent/scan')).data.data,
    onSuccess: () => {
      invalidate(qc)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
