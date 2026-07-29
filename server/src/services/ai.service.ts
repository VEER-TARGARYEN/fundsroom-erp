import type { Role } from '@prisma/client'
import { prisma } from '../config/prisma'
import { getAiClient, aiEnabled } from '../config/ai'
import { env } from '../config/env'
import { AppError } from '../utils/AppError'
import { logger } from '../config/logger'
import { aiOutputSchema, type AssistantInput } from '../schemas/ai.schema'
import { GST_RATE } from '../constants/business'

/**
 * A compact, real-time snapshot of the business, assembled from the database and
 * fed to the model as ground truth. This is what turns the assistant from a
 * generic chatbot into a copilot that answers with the company's actual numbers.
 *
 * Financial figures (inventory valuation, confirmed sales) are omitted for the
 * WAREHOUSE role, mirroring the app's existing RBAC (warehouse staff never see
 * financial data).
 */
async function buildBusinessContext(role: Role) {
  const showFinancials = role !== 'WAREHOUSE'
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const [
    customerTotal,
    leadCount,
    followUpsDue,
    productTotal,
    outOfStock,
    lowStockItems,
    draftChallans,
    inventoryValueRows,
    monthSales,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { status: 'LEAD' } }),
    prisma.customer.count({
      where: { followUpDate: { lte: today }, status: { in: ['LEAD', 'ACTIVE'] } },
    }),
    prisma.product.count(),
    prisma.product.count({ where: { stockQuantity: 0 } }),
    // Column-to-column comparison via Prisma field references: stock <= minStock.
    prisma.product.findMany({
      where: { stockQuantity: { lte: prisma.product.fields.minStock } },
      select: { sku: true, name: true, stockQuantity: true, minStock: true, category: true },
      orderBy: { stockQuantity: 'asc' },
      take: 8,
    }),
    prisma.challan.count({ where: { status: 'DRAFT' } }),
    showFinancials
      ? prisma.$queryRaw<{ value: string }[]>`
          SELECT COALESCE(SUM(unit_price * stock_quantity), 0)::text AS value FROM products`
      : Promise.resolve([{ value: '0' }]),
    showFinancials
      ? prisma.challan.aggregate({
          _sum: { totalAmount: true },
          _count: true,
          where: { status: 'CONFIRMED', confirmedAt: { gte: startOfMonth } },
        })
      : Promise.resolve(null),
  ])

  return {
    generatedAt: new Date().toISOString(),
    customers: {
      total: customerTotal,
      leads: leadCount,
      followUpsDue,
    },
    inventory: {
      totalProducts: productTotal,
      outOfStock,
      lowStockCount: lowStockItems.length,
      lowStock: lowStockItems.map((p) => ({
        sku: p.sku,
        name: p.name,
        category: p.category,
        inStock: p.stockQuantity,
        minStock: p.minStock,
      })),
      ...(showFinancials
        ? { valuation: inventoryValueRows[0]?.value ?? '0' }
        : {}),
    },
    sales: showFinancials
      ? {
          draftChallans,
          confirmedThisMonth: monthSales?._count ?? 0,
          revenueThisMonth: monthSales?._sum.totalAmount?.toString() ?? '0',
          gstRatePct: GST_RATE.toNumber() * 100,
        }
      : { draftChallans },
  }
}

type BusinessContext = Awaited<ReturnType<typeof buildBusinessContext>>

const SYSTEM_PROMPT = (role: Role, ctx: BusinessContext) => `
You are "Nexus", the embedded AI operations copilot inside the Fundsroom ERP + CRM
used by a B2B wholesale company in India. The user's role is ${role}.

Ground every factual claim ONLY in the BUSINESS_CONTEXT JSON below — it is a live
snapshot from the database. Never invent customers, SKUs, or figures that are not
present. If the context doesn't contain what's needed, say so briefly and suggest
where the user could look. Amounts are Indian Rupees (₹). Be concise, concrete and
action-oriented — this is an operations tool, not a chatbot.

BUSINESS_CONTEXT:
${JSON.stringify(ctx)}

Respond with a SINGLE JSON object, no markdown fences, matching exactly:
{
  "answer": string,            // GitHub-flavoured markdown; short paragraphs / bullet lists
  "suggestions": string[],     // 2-3 natural next questions the user might ask, each < 60 chars
  "tags": string[],            // 1-3 short topic tags, e.g. "Inventory", "Follow-ups"
  "sentiment": "positive" | "neutral" | "warning" | "critical",  // operational urgency of the answer
  "confidence": number         // 0..1, your confidence given the available context
}
`.trim()

/** Rough reading time so the UI can show a "~Ns read" pill. ~200 wpm. */
function readingTimeSec(text: string): number {
  const words = text.trim().split(/\s+/).length
  return Math.max(3, Math.ceil((words / 200) * 60))
}

export interface AssistantResult {
  answer: string
  suggestions: string[]
  meta: {
    tags: string[]
    sentiment: string
    confidence: number
    readingTimeSec: number
    model: string
    provider: string
    grounded: true
    latencyMs: number
  }
  /** Compact grounding figures so the UI can render "based on live data" chips. */
  context: {
    lowStockCount: number
    followUpsDue: number
    draftChallans: number
    leads: number
  }
}

/**
 * Answer a natural-language question, grounded in the live ERP snapshot, and
 * return a structured payload the frontend can render directly (answer bubble +
 * suggestion pills + metadata badges + grounding chips).
 */
export async function askAssistant(role: Role, input: AssistantInput): Promise<AssistantResult> {
  if (!aiEnabled) {
    throw new AppError(
      503,
      'AI_NOT_CONFIGURED',
      'The AI assistant is not configured. Set AI_API_KEY on the server to enable it.',
    )
  }
  const openai = getAiClient()!
  const ctx = await buildBusinessContext(role)
  const startedAt = Date.now()

  let completion
  try {
    completion = await openai.chat.completions.create({
      model: env.AI_MODEL,
      temperature: 0.3,
      max_tokens: env.AI_MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT(role, ctx) },
        ...input.history.map((m) => ({ role: m.role, content: m.content }) as const),
        { role: 'user', content: input.message },
      ],
    })
  } catch (err) {
    logger.error({ err }, 'AI provider request failed')
    throw new AppError(
      502,
      'AI_UPSTREAM_ERROR',
      'The AI provider could not be reached. Please try again in a moment.',
    )
  }

  const latencyMs = Date.now() - startedAt
  const raw = completion.choices[0]?.message?.content ?? ''

  let parsed
  try {
    parsed = aiOutputSchema.parse(JSON.parse(raw))
  } catch (err) {
    logger.error({ err, raw }, 'AI returned malformed output')
    throw new AppError(502, 'AI_BAD_OUTPUT', 'The AI returned an unexpected response. Please retry.')
  }

  return {
    answer: parsed.answer,
    suggestions: parsed.suggestions.slice(0, 3),
    meta: {
      tags: parsed.tags,
      sentiment: parsed.sentiment,
      confidence: parsed.confidence,
      readingTimeSec: readingTimeSec(parsed.answer),
      model: env.AI_MODEL,
      provider: env.AI_PROVIDER,
      grounded: true,
      latencyMs,
    },
    context: {
      lowStockCount: ctx.inventory.lowStockCount,
      followUpsDue: ctx.customers.followUpsDue,
      draftChallans: ctx.sales.draftChallans,
      leads: ctx.customers.leads,
    },
  }
}
