import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { ApiEnvelope } from '@/types/api'

export interface AiTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantResponse {
  answer: string
  suggestions: string[]
  meta: {
    tags: string[]
    sentiment: 'positive' | 'neutral' | 'warning' | 'critical'
    confidence: number
    readingTimeSec: number
    model: string
    provider: string
    grounded: true
    latencyMs: number
  }
  context: {
    lowStockCount: number
    followUpsDue: number
    draftChallans: number
    leads: number
  }
}

/** Is the AI assistant configured on the server? Drives "ready" vs "pending" UI. */
export function useAiStatus() {
  return useQuery({
    queryKey: ['ai', 'status'],
    queryFn: async () => (await api.get<ApiEnvelope<{ enabled: boolean }>>('/ai/status')).data.data,
    staleTime: 5 * 60_000,
  })
}

/** Ask the grounded ERP copilot a question. */
export function useAskAssistant() {
  return useMutation({
    mutationFn: async (payload: { message: string; history?: AiTurn[] }) =>
      (await api.post<ApiEnvelope<AssistantResponse>>('/ai/assistant', payload)).data.data,
  })
}
