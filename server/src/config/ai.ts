import OpenAI from 'openai'
import { env } from './env'

/**
 * Provider-agnostic LLM client. Groq, OpenRouter and OpenAI all speak the same
 * OpenAI Chat Completions wire format, so a single `openai` client pointed at
 * the configured `AI_BASE_URL` covers every option — swap providers with env
 * only, no code change.
 *
 *   Groq       → https://api.groq.com/openai/v1   (llama-3.3-70b-versatile)
 *   OpenRouter → https://openrouter.ai/api/v1     (any routed model)
 *   OpenAI     → https://api.openai.com/v1        (gpt-4o-mini, …)
 *
 * The client is created lazily and only when an API key is present, so the
 * server boots perfectly fine with AI switched off (endpoints then return a
 * clean 503 AI_NOT_CONFIGURED instead of crashing).
 */
let client: OpenAI | null = null

export const aiEnabled = Boolean(env.AI_API_KEY)

export function getAiClient(): OpenAI | null {
  if (!aiEnabled) return null
  if (!client) {
    client = new OpenAI({
      apiKey: env.AI_API_KEY,
      baseURL: env.AI_BASE_URL,
      timeout: 25_000,
      maxRetries: 1,
    })
  }
  return client
}
