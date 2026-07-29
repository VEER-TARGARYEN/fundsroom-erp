import { z } from 'zod'

/**
 * Request body for POST /api/ai/assistant.
 * `history` is an optional short rolling window of prior turns so the copilot
 * can hold a conversation without the client re-sending everything.
 */
export const assistantSchema = z.object({
  message: z.string().trim().min(1, 'Ask a question').max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .max(10)
    .optional()
    .default([]),
})

export type AssistantInput = z.infer<typeof assistantSchema>

/**
 * The exact JSON contract the LLM is required to return. We validate the model
 * output against this before it ever reaches the client, so a malformed / rogue
 * completion becomes a clean 502 instead of leaking half-parsed data to the UI.
 */
export const aiOutputSchema = z.object({
  answer: z.string().min(1),
  suggestions: z.array(z.string().min(1)).max(3).default([]),
  tags: z.array(z.string().min(1)).max(4).default([]),
  sentiment: z.enum(['positive', 'neutral', 'warning', 'critical']).default('neutral'),
  confidence: z.number().min(0).max(1).default(0.7),
})

export type AiOutput = z.infer<typeof aiOutputSchema>
