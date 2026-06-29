import OpenAI from 'openai'
import { getPrisma } from '../lib/prisma'
import { ExtractedData } from './extraction.service'
import { recordAiUsage } from './ai-usage.service'
import {
  incrementalExtractionSchema,
  jsonSchemaResponseFormat,
  removeNullishAndEmpty,
} from './openai-schemas'
import { TranscriptionSegment } from './transcription-session.service'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export interface ExtractedFieldState {
  value: unknown
  evidence?: string
  confidence: number
  sourceSeqs: number[]
  status: 'confirmado' | 'duvidoso' | 'conflito'
  updatedAt: string
}

export interface ExtractionState {
  lastAnalyzedSeq: number
  fields: Record<string, ExtractedFieldState>
  conflicts: Array<{
    field: string
    existingValue?: string
    newValue?: string
    evidence?: string
    sourceSeqs: number[]
  }>
  usageSummary?: Record<string, unknown>
  updatedAt?: string
}

interface IncrementalResponse {
  lastAnalyzedSeq: number
  extracted: ExtractedData
  fieldStates: Array<{
    field: string
    evidence?: string | null
    confidence: number
    sourceSeqs: number[]
    status: 'confirmado' | 'duvidoso' | 'conflito'
  }>
  conflicts: Array<{
    field: string
    existingValue?: string | null
    newValue?: string | null
    evidence?: string | null
    sourceSeqs: number[]
  }>
}

const SYSTEM_PROMPT = `Voce extrai dados clinicos incrementais de segmentos novos de uma consulta medica em portugues do Brasil.

Regras:
- Analise apenas os segmentos novos enviados.
- Use o estado anterior so para detectar conflitos e evitar duplicidade.
- Nao invente informacoes.
- Marque como confirmado apenas dados claramente ditos.
- Use duvidoso para trechos ambiguos.
- Use conflito quando o novo trecho contradizer o estado anterior.
- Inclua evidencia curta e os sourceSeqs para cada campo alterado.`

function parseSegments(value?: string | null): TranscriptionSegment[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as TranscriptionSegment[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function parseExtractionState(value?: string | null): ExtractionState {
  if (!value) return { lastAnalyzedSeq: 0, fields: {}, conflicts: [] }
  try {
    const parsed = JSON.parse(value) as ExtractionState
    return {
      lastAnalyzedSeq: parsed.lastAnalyzedSeq || 0,
      fields: parsed.fields || {},
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
      usageSummary: parsed.usageSummary,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return { lastAnalyzedSeq: 0, fields: {}, conflicts: [] }
  }
}

function getValueByPath(source: Record<string, unknown>, path: string) {
  return source[path]
}

function extractedFromConfirmedState(state: ExtractionState): ExtractedData {
  const out: Record<string, unknown> = {}
  for (const [field, fieldState] of Object.entries(state.fields)) {
    if (fieldState.status !== 'confirmado') continue
    if (fieldState.value == null) continue
    out[field] = fieldState.value
  }
  return removeNullishAndEmpty(out) as ExtractedData
}

function mergeIncrementalResponse(previous: ExtractionState, response: IncrementalResponse): ExtractionState {
  const now = new Date().toISOString()
  const extracted = removeNullishAndEmpty(response.extracted || {}) as Record<string, unknown>
  const next: ExtractionState = {
    ...previous,
    lastAnalyzedSeq: Math.max(previous.lastAnalyzedSeq || 0, response.lastAnalyzedSeq || 0),
    fields: { ...previous.fields },
    conflicts: [...(previous.conflicts || [])],
    updatedAt: now,
  }

  for (const fieldState of response.fieldStates || []) {
    const value = getValueByPath(extracted, fieldState.field)
    if (value == null) continue
    next.fields[fieldState.field] = {
      value,
      evidence: fieldState.evidence || undefined,
      confidence: fieldState.confidence,
      sourceSeqs: fieldState.sourceSeqs || [],
      status: fieldState.status,
      updatedAt: now,
    }
  }

  for (const conflict of response.conflicts || []) {
    next.conflicts.push({
      field: conflict.field,
      existingValue: conflict.existingValue || undefined,
      newValue: conflict.newValue || undefined,
      evidence: conflict.evidence || undefined,
      sourceSeqs: conflict.sourceSeqs || [],
    })
  }

  next.conflicts = next.conflicts.slice(-50)
  return next
}

export async function extractIncrementalForConsultation(consultationId: string, userId: string) {
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: consultationId, userId },
    select: { id: true, transcriptSegmentsJson: true, extractionStateJson: true },
  })

  if (!consultation) return { extracted: {}, state: null, analyzed: false }

  const previousState = parseExtractionState(consultation.extractionStateJson)
  const segments = parseSegments(consultation.transcriptSegmentsJson)
    .filter((segment) => segment.status === 'confirmed' && segment.seq > previousState.lastAnalyzedSeq)
    .sort((a, b) => a.seq - b.seq)

  if (!segments.length) {
    return {
      extracted: extractedFromConfirmedState(previousState),
      state: previousState,
      analyzed: false,
    }
  }

  const model = process.env.OPENAI_INCREMENTAL_EXTRACTION_MODEL || 'gpt-4o-mini'
  const startedAt = Date.now()

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          previousState,
          newSegments: segments.map((segment) => ({
            seq: segment.seq,
            text: segment.text,
            startedAtMs: segment.startedAtMs,
            endedAtMs: segment.endedAtMs,
          })),
        }),
      },
    ],
    temperature: 0.1,
    max_tokens: 2200,
    response_format: jsonSchemaResponseFormat(
      'clinical_incremental_extraction',
      incrementalExtractionSchema,
      'Extracao clinica incremental com evidencias por campo'
    ),
  })

  await recordAiUsage(
    {
      consultationId,
      service: 'clinical_extraction_incremental',
      model,
      reason: 'segmentos_novos',
      segmentCount: segments.length,
      startedAt,
    },
    response.usage
  )

  let parsed: IncrementalResponse
  try {
    parsed = JSON.parse(response.choices[0]?.message?.content || '{}') as IncrementalResponse
  } catch {
    parsed = {
      lastAnalyzedSeq: Math.max(...segments.map((segment) => segment.seq)),
      extracted: {},
      fieldStates: [],
      conflicts: [],
    }
  }

  const merged = mergeIncrementalResponse(previousState, parsed)
  await getPrisma().consultation.update({
    where: { id: consultation.id },
    data: { extractionStateJson: JSON.stringify(merged) },
  })

  return {
    extracted: extractedFromConfirmedState(merged),
    state: merged,
    analyzed: true,
  }
}
