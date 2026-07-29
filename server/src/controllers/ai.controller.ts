import type { Request, Response } from 'express'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import { aiEnabled } from '../config/ai'
import { askAssistant } from '../services/ai.service'
import type { AssistantInput } from '../schemas/ai.schema'

/** GET /api/ai/status — lets the frontend show "AI ready" vs "Backend Pending". */
export const aiStatus = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: { enabled: aiEnabled } })
})

/** POST /api/ai/assistant — grounded, structured copilot response. */
export const assistant = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized()
  const input = req.body as AssistantInput
  const result = await askAssistant(req.user.role, input)
  res.json({ data: result })
})
