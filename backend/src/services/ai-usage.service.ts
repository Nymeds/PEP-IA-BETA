import { getPrisma } from '../lib/prisma'

interface OpenAIUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
}

export interface AiUsageContext {
  consultationId?: string
  service: string
  model: string
  reason: string
  segmentCount?: number
  startedAt: number
}

interface AiUsageEntry {
  service: string
  model: string
  reason: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
  latencyMs: number
  segmentCount?: number
  createdAt: string
}

interface AiUsageState {
  totals: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cachedTokens: number
    calls: number
  }
  calls: AiUsageEntry[]
}

function parseUsageState(value?: string | null): AiUsageState {
  if (!value) {
    return {
      totals: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, calls: 0 },
      calls: [],
    }
  }

  try {
    const parsed = JSON.parse(value) as AiUsageState
    return {
      totals: {
        promptTokens: parsed.totals?.promptTokens || 0,
        completionTokens: parsed.totals?.completionTokens || 0,
        totalTokens: parsed.totals?.totalTokens || 0,
        cachedTokens: parsed.totals?.cachedTokens || 0,
        calls: parsed.totals?.calls || 0,
      },
      calls: Array.isArray(parsed.calls) ? parsed.calls : [],
    }
  } catch {
    return {
      totals: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, calls: 0 },
      calls: [],
    }
  }
}

export async function recordAiUsage(context: AiUsageContext | undefined, usage?: OpenAIUsage | null) {
  if (!context?.consultationId) return

  const entry: AiUsageEntry = {
    service: context.service,
    model: context.model,
    reason: context.reason,
    promptTokens: usage?.prompt_tokens || 0,
    completionTokens: usage?.completion_tokens || 0,
    totalTokens: usage?.total_tokens || 0,
    cachedTokens: usage?.prompt_tokens_details?.cached_tokens || 0,
    latencyMs: Date.now() - context.startedAt,
    segmentCount: context.segmentCount,
    createdAt: new Date().toISOString(),
  }

  const consultation = await getPrisma().consultation.findUnique({
    where: { id: context.consultationId },
    select: { id: true, aiUsageJson: true },
  })
  if (!consultation) return

  const state = parseUsageState(consultation.aiUsageJson)
  state.totals.promptTokens += entry.promptTokens
  state.totals.completionTokens += entry.completionTokens
  state.totals.totalTokens += entry.totalTokens
  state.totals.cachedTokens += entry.cachedTokens
  state.totals.calls += 1
  state.calls = [...state.calls, entry].slice(-100)

  await getPrisma().consultation.update({
    where: { id: consultation.id },
    data: { aiUsageJson: JSON.stringify(state) },
  })
}
