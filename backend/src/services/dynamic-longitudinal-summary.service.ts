import { createHash } from 'crypto'
import { createStructuredResponse } from './openai-responses.service'

export interface DynamicLongitudinalRecord {
  date: string
  source: 'legacy' | 'dynamic'
  templateVersionId?: string | null
  sharedFields: Array<{
    id: string
    label: string
    value: unknown
    source: string
    reviewStatus: string
  }>
}

export interface DynamicLongitudinalSummary {
  overview: string
  activeProblems: string[]
  medications: string[]
  allergies: string[]
  recommendations: string
}

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overview: { type: 'string' },
    activeProblems: { type: 'array', items: { type: 'string' } },
    medications: { type: 'array', items: { type: 'string' } },
    allergies: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'string' },
  },
  required: ['overview', 'activeProblems', 'medications', 'allergies', 'recommendations'],
}

export async function summarizeDynamicLongitudinalRecord(input: {
  ownerId: string
  records: DynamicLongitudinalRecord[]
}) {
  if (!input.records.length) return null
  const versionKey = Array.from(new Set(
    input.records.map((record) => record.templateVersionId || record.source)
  )).sort().join(':')
  const promptCacheKey = createHash('sha256')
    .update(`psychology-longitudinal:${input.ownerId}:${versionKey}`)
    .digest('hex')

  const response = await createStructuredResponse<DynamicLongitudinalSummary>({
    model: process.env.OPENAI_DYNAMIC_FINAL_MODEL || 'gpt-5.6-sol',
    reasoningEffort: 'medium',
    instructions: `Voce produz uma sintese longitudinal cautelosa, em pt-BR, para revisao do psicologo.
Use somente os campos do prontuario compartilhavel recebidos. Conteudo do registro restrito, transcript e audio nunca sao fornecidos.
Nao diagnostique, nao prescreva, nao transforme hipotese em fato e nao invente continuidade entre sessoes.
Preserve datas, incertezas, negacoes e fonte. "recommendations" significa pontos documentais a revisar, nunca conduta autonoma.
Retorne somente o objeto definido no schema.`,
    input: { records: input.records },
    schemaName: 'psychology_longitudinal_shared_summary',
    schemaDescription: 'Resumo longitudinal baseado apenas no prontuario compartilhavel',
    schema: SUMMARY_SCHEMA,
    maxOutputTokens: 2600,
    promptCacheKey,
    safetyIdentifier: input.ownerId,
  })
  return response.data
}
