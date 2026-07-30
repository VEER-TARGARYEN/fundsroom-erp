import 'dotenv/config'
import { z } from 'zod'

/**
 * Validate & type the process environment at startup. If anything is missing or
 * malformed the process exits immediately with a clear message — we never boot
 * a half-configured server.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  JWT_ISSUER: z.string().default('fundsroom-erp'),
  JWT_AUDIENCE: z.string().default('fundsroom-web'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  // ── AI (optional). If AI_API_KEY is unset, AI endpoints return 503 cleanly. ──
  // Works with any OpenAI-compatible provider (Groq / OpenRouter / OpenAI).
  AI_PROVIDER: z.string().default('groq'),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  AI_MODEL: z.string().default('llama-3.3-70b-versatile'),
  AI_MAX_TOKENS: z.coerce.number().int().positive().max(4000).default(900),

  // ── Notification agent (all optional) ──────────────────────────────────────
  // Shared secret for the unattended scan trigger (cron). When unset, the
  // header route is disabled entirely and only an authenticated ADMIN can scan
  // — fail closed rather than leaving an unauthenticated endpoint open.
  AGENT_SECRET: z.string().min(16).optional(),
  /** Resend API key. Without it the agent still runs; it just doesn't email. */
  RESEND_API_KEY: z.string().optional(),
  ALERT_EMAIL_TO: z.string().optional(),
  ALERT_EMAIL_FROM: z.string().default('Fundsroom ERP <onboarding@resend.dev>'),
  /** Public frontend URL, used to deep-link from emails. */
  APP_URL: z.string().url().optional(),

  // ── Google OAuth + Workspace (all optional) ────────────────────────────────
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Must match a redirect URI registered in the Google Cloud credentials. */
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  /**
   * Who may sign in with Google. Comma-separated emails and/or @domains.
   * Deliberately fails closed: with this unset, Google sign-in only works for
   * people who already have an account, so a stranger's Google login can never
   * provision itself into the ERP.
   */
  GOOGLE_ALLOWED_EMAILS: z.string().optional(),
  /** Role granted to auto-provisioned Google users. Least privilege by default. */
  GOOGLE_DEFAULT_ROLE: z.enum(['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS']).default('SALES'),
  /**
   * 32-byte key (base64 or hex) encrypting stored Google refresh tokens.
   * Without it, Workspace connections are refused rather than stored in clear.
   */
  TOKEN_ENC_KEY: z.string().optional(),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    '❌ Invalid environment configuration:\n' +
      parsed.error.issues.map((i) => `   • ${i.path.join('.')}: ${i.message}`).join('\n'),
  )
  process.exit(1)
}

const raw = parsed.data

/**
 * Canonical form of an origin for comparison. A browser's `Origin` header is
 * always scheme+host+port with no trailing slash and a lowercase host, but a
 * URL pasted from an address bar into a dashboard usually keeps the trailing
 * slash — normalizing both sides stops that mismatch from silently breaking CORS.
 */
export function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '')
}

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  isDev: raw.NODE_ENV === 'development',
  corsOrigins: raw.CORS_ORIGIN.split(',').map(normalizeOrigin).filter(Boolean),
}

export type Env = typeof env
