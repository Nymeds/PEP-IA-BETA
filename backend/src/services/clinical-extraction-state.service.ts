import { getPrisma } from '../lib/prisma'
import { reinterpretFullTranscript } from './extraction.service'
import { normalizeExtractedData } from './clinical-catalog.service'

interface ExtractionStateSummary {
  lastAnalyzedSeq: number
  autoAppliedCount: number
  suggestionCount: number
  conflictCount: number
}

function parseJson<T>(value?: string | null, fallback?: T): T {
  if (!value?.trim()) return fallback as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback as T
  }
}

function latestSeq(segmentsJson?: string | null) {
  const segments = parseJson<Array<{ seq?: number }>>(segmentsJson, [])
  return segments.reduce((max, segment) => {
    const seq = typeof segment?.seq === 'number' ? segment.seq : 0
    return Math.max(max, seq)
  }, 0)
}

export async function extractIncrementalForConsultation(consultationId: string, userId: string) {
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: consultationId, userId },
    select: {
      id: true,
      transcript: true,
      transcriptSegmentsJson: true,
      extractionStateJson: true,
    },
  })

  if (!consultation) {
    throw new Error('Consulta nao encontrada')
  }

  const lastAnalyzedSeq = latestSeq(consultation.transcriptSegmentsJson)
  const previousState = parseJson<Record<string, unknown>>(consultation.extractionStateJson, {})
  const hasTranscript = Boolean(consultation.transcript?.trim())

  if (!hasTranscript) {
    return {
      analyzed: false,
      extracted: {},
      appliedDelta: {},
      suggestions: [],
      stateSummary: {
        lastAnalyzedSeq,
        autoAppliedCount: 0,
        suggestionCount: 0,
        conflictCount: 0,
      } as ExtractionStateSummary,
      state: previousState,
    }
  }

  const rawExtracted = await reinterpretFullTranscript(consultation.transcript || '')
  const extracted = normalizeExtractedData(rawExtracted)
  const keys = Object.keys(extracted)

  const state = {
    lastAnalyzedSeq,
    fields: extracted,
    suggestions: [],
    conflicts: [],
    updatedAt: new Date().toISOString(),
  }

  await getPrisma().consultation.update({
    where: { id: consultation.id },
    data: {
      extractionStateJson: JSON.stringify(state),
    },
  })

  return {
    analyzed: true,
    extracted,
    appliedDelta: extracted,
    suggestions: [],
    stateSummary: {
      lastAnalyzedSeq,
      autoAppliedCount: keys.length,
      suggestionCount: 0,
      conflictCount: 0,
    } as ExtractionStateSummary,
    state,
  }
}
