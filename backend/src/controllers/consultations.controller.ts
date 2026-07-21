import { randomUUID } from 'crypto'
import { FastifyReply, FastifyRequest } from 'fastify'
import { getPrisma } from '../lib/prisma'
import { transcribeAudioBuffer, saveFullAudio, readFullAudio, removeStoredAudio } from '../services/speech.service'
import {
  CLINICAL_FIELD_IDS,
  ClinicalFieldId,
  ClinicalSuggestion,
  ClinicalTemplateId,
  ExtractedData,
  FieldProvenance,
  SpecialtyDataItem,
  extractClinicalDelta,
  parseJsonSafely,
  reinterpretFullTranscript,
  resolveClinicalTemplate,
  serializeExtractedToDb,
} from '../services/extraction.service'
import { runFinalReview } from '../services/review.service'
import { suggestTopics } from '../services/analysis.service'
import { createRealtimeClientSecret } from '../services/realtime.service'
import { resolveClinicalRecordEngine } from '../services/clinical-record-engine.service'
import { isDynamicPsychologyEnabled } from '../services/form-templates.service'
import { recordSensitiveAccess } from '../services/access-audit.service'
import {
  enqueuePendingAudioDeletion,
  processPendingAudioDeletions,
} from '../services/retention.service'
import {
  assertDynamicRecordingConsent,
  createDynamicTranscriptVersion,
  generateDynamicDocument,
  getDynamicConversationTopics,
  reinterpretDynamicConsultation,
} from './dynamic-consultations.controller'
import {
  CONSULTATION_STATUS,
  normalizeConsultationStatus,
} from '../lib/schedule'

const CLINICAL_FIELDS = [
  'chiefComplaint',
  'hda',
  'symptomStart',
  'symptomIntensity',
  'symptoms',
  'improvingFactors',
  'worseningFactors',
  'previousDiseases',
  'surgeries',
  'hospitalizations',
  'allergiesDetails',
  'currentMedications',
  'familyHistory',
  'smoking',
  'alcohol',
  'physicalActivity',
  'sleep',
  'diet',
  'drugs',
  'occupation',
  'systemsReview',
  'vitalSigns',
  'weight',
  'height',
  'bmi',
  'generalState',
  'physicalExam',
  'mainHypothesis',
  'differentials',
  'confirmedDiagnosis',
  'cid',
  'therapeuticPlan',
  'orientations',
  'referrals',
  'followUpDate',
  'subjective',
  'objective',
  'assessment',
  'plan',
] as const

class AudioSaveConflictError extends Error {}

const LEGACY_NUMBER_FIELDS = new Set<string>(['weight', 'height', 'bmi'])

function pickLegacyConsultationUpdate(body: Record<string, unknown>) {
  const data: Record<string, string | number | null> = {}
  for (const field of CLINICAL_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue
    const value = body[field]
    if (value === null) {
      data[field] = null
      continue
    }
    if (LEGACY_NUMBER_FIELDS.has(field)) {
      if (typeof value === 'number' && Number.isFinite(value)) data[field] = value
      continue
    }
    if (typeof value === 'string' && value.length <= 200_000) data[field] = value
  }

  const transcript = body.transcript
  if (transcript === null || (typeof transcript === 'string' && transcript.length <= 2_000_000)) {
    data.transcript = transcript
  }
  return data
}

const JSON_CLINICAL_FIELDS = new Set<string>([
  'symptoms',
  'previousDiseases',
  'surgeries',
  'hospitalizations',
  'allergiesDetails',
  'currentMedications',
  'familyHistory',
  'systemsReview',
  'vitalSigns',
  'physicalExam',
  'differentials',
  'cid',
])

const REVIEW_REQUIRED_FIELDS = new Set<ClinicalFieldId>([
  'allergiesDetails',
  'currentMedications',
  'vitalSigns',
  'weight',
  'height',
  'generalState',
  'physicalExam',
  'mainHypothesis',
  'differentials',
  'confirmedDiagnosis',
  'cid',
  'therapeuticPlan',
  'orientations',
  'referrals',
  'followUpDate',
])

const SUGGESTION_ONLY_FIELDS = new Set<ClinicalFieldId>([
  'mainHypothesis',
  'differentials',
  'confirmedDiagnosis',
  'cid',
  'therapeuticPlan',
  'orientations',
  'referrals',
  'followUpDate',
])

const CLINICAL_FIELD_LABELS: Partial<Record<ClinicalFieldId, string>> = {
  allergiesDetails: 'alergias',
  currentMedications: 'medicações em uso',
  vitalSigns: 'sinais vitais',
  weight: 'peso',
  height: 'altura',
  generalState: 'estado geral',
  physicalExam: 'exame físico',
  mainHypothesis: 'hipótese diagnóstica',
  differentials: 'diagnósticos diferenciais',
  confirmedDiagnosis: 'diagnóstico confirmado',
  cid: 'CID',
  therapeuticPlan: 'plano terapêutico',
  orientations: 'orientações',
  referrals: 'encaminhamento',
  followUpDate: 'retorno',
}

function clinicalFieldLabel(field: ClinicalFieldId) {
  return CLINICAL_FIELD_LABELS[field] || field
}

const AI_PROCESSING_LEASE_MS = 45_000
const AI_CLINICAL_REASONING_EVERY_SEGMENTS = Math.max(
  2,
  Number(process.env.AI_CLINICAL_REASONING_EVERY_SEGMENTS) || 4
)
const AI_CLINICAL_REASONING_CONTEXT_SEGMENTS = Math.max(
  2,
  Number(process.env.AI_CLINICAL_REASONING_CONTEXT_SEGMENTS) || 6
)

function hasClinicalContent(value: unknown) {
  if (value == null) return false
  if (typeof value === 'number') return true
  if (typeof value !== 'string') return true
  const normalized = value.trim()
  return normalized !== '' && normalized !== '[]' && normalized !== '{}' && normalized !== 'null'
}

function compactClinicalValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length <= 600) return value
    return `${value.slice(0, 300)} ... ${value.slice(-300)}`
  }
  if (Array.isArray(value)) return value.slice(-20).map(compactClinicalValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 20)
        .map(([key, item]) => [key, compactClinicalValue(item)])
    )
  }
  return value
}

function buildClinicalState(consultation: Record<string, unknown>) {
  const state: Record<string, unknown> = {}
  for (const field of CLINICAL_FIELDS) {
    const value = consultation[field]
    if (!hasClinicalContent(value)) continue
    const parsedValue = JSON_CLINICAL_FIELDS.has(field) && typeof value === 'string'
      ? parseJsonSafely(value, value)
      : value
    state[field] = compactClinicalValue(parsedValue)
  }

  if (typeof consultation.specialtyData === 'string') {
    state.specialtyData = parseJsonSafely(consultation.specialtyData, {})
  }

  return state
}

function parseFieldMeta(value: string | null | undefined) {
  return parseJsonSafely<Record<string, FieldProvenance>>(value, {})
}

function parseSuggestions(value: string | null | undefined) {
  return parseJsonSafely<ClinicalSuggestion[]>(value, [])
}

function mergeFieldMeta(
  current: Record<string, FieldProvenance>,
  incoming: Record<string, FieldProvenance>
) {
  const next = { ...current }
  for (const [field, meta] of Object.entries(incoming)) {
    const previous = next[field]
    next[field] = previous?.status === 'manual' || previous?.status === 'dismissed'
      ? previous
      : meta
  }
  return next
}

function mergeSpecialtyData(currentValue: string | null | undefined, items: SpecialtyDataItem[]) {
  const current = parseJsonSafely<Record<string, string>>(currentValue, {})
  const next = { ...current }
  for (const item of items) {
    if (!item.value.trim() || hasClinicalContent(next[item.key])) continue
    next[item.key] = item.value
  }
  return Object.keys(next).length ? JSON.stringify(next) : undefined
}

function valueToSuggestion(value: unknown) {
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

const MERGEABLE_ARRAY_FIELDS = new Set<ClinicalFieldId>([
  'symptoms',
  'previousDiseases',
  'surgeries',
  'hospitalizations',
  'allergiesDetails',
  'currentMedications',
])

const MERGEABLE_OBJECT_FIELDS = new Set<ClinicalFieldId>([
  'vitalSigns',
  'physicalExam',
])

function mergeUniqueItems(current: unknown[], incoming: unknown[]) {
  const seen = new Set<string>()
  return [...current, ...incoming].filter((item) => {
    const key = JSON.stringify(item).toLocaleLowerCase('pt-BR')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mergeSafeClinicalValue(field: ClinicalFieldId, currentValue: unknown, incomingValue: unknown) {
  if (MERGEABLE_ARRAY_FIELDS.has(field) && Array.isArray(incomingValue)) {
    const currentItems = typeof currentValue === 'string'
      ? parseJsonSafely<unknown[]>(currentValue, [])
      : Array.isArray(currentValue) ? currentValue : []
    return mergeUniqueItems(currentItems, incomingValue)
  }

  if (field === 'systemsReview' && incomingValue && typeof incomingValue === 'object') {
    const currentReview = typeof currentValue === 'string'
      ? parseJsonSafely<Record<string, string[]>>(currentValue, {})
      : (currentValue || {}) as Record<string, string[]>
    const incomingReview = incomingValue as Record<string, string[]>
    return Object.fromEntries(
      Array.from(new Set([...Object.keys(currentReview), ...Object.keys(incomingReview)])).map((system) => [
        system,
        mergeUniqueItems(currentReview[system] || [], incomingReview[system] || []),
      ])
    )
  }

  if (field === 'familyHistory' && incomingValue && typeof incomingValue === 'object') {
    const currentHistory = typeof currentValue === 'string'
      ? parseJsonSafely<Record<string, boolean>>(currentValue, {})
      : (currentValue || {}) as Record<string, boolean>
    return { ...currentHistory, ...(incomingValue as Record<string, boolean>) }
  }

  if (MERGEABLE_OBJECT_FIELDS.has(field) && incomingValue && typeof incomingValue === 'object') {
    const currentObject = typeof currentValue === 'string'
      ? parseJsonSafely<Record<string, unknown>>(currentValue, {})
      : (currentValue || {}) as Record<string, unknown>
    return { ...currentObject, ...(incomingValue as Record<string, unknown>) }
  }

  if (field === 'hda' && typeof currentValue === 'string' && typeof incomingValue === 'string') {
    const currentNormalized = normalizeTranscriptForCompare(currentValue).toLocaleLowerCase('pt-BR')
    const incomingNormalized = normalizeTranscriptForCompare(incomingValue).toLocaleLowerCase('pt-BR')
    if (currentNormalized.includes(incomingNormalized)) return currentValue
    if (incomingNormalized.includes(currentNormalized)) return incomingValue
    return `${currentValue.trim()} ${incomingValue.trim()}`
  }

  return incomingValue
}

function filterAutomaticExtracted(
  current: Record<string, unknown>,
  extracted: ExtractedData,
  fieldMeta: Record<string, FieldProvenance>,
  previousFieldMeta: Record<string, FieldProvenance>
) {
  const automatic: ExtractedData = {}
  const suggestions: ClinicalSuggestion[] = []

  for (const [field, value] of Object.entries(extracted)) {
    if (field === 'currentSection' || !CLINICAL_FIELD_IDS.includes(field as ClinicalFieldId)) continue
    const fieldId = field as ClinicalFieldId
    const meta = fieldMeta[fieldId]
    if (!meta?.evidence.length) continue
    const currentHasContent = hasClinicalContent(current[fieldId])

    if (meta.status === 'manual' || meta.status === 'dismissed') continue

    if (SUGGESTION_ONLY_FIELDS.has(fieldId)) {
      if (currentHasContent) continue
      suggestions.push({
        id: `review-${fieldId}-${meta.evidence[0]?.sequence || 0}`,
        category: 'documentation',
        title: `Revisar ${clinicalFieldLabel(fieldId)}`,
        message: 'Informação identificada pela IA. Confirme antes de incluir no prontuário.',
        field: fieldId,
        proposedValue: valueToSuggestion(value),
        evidence: meta.evidence,
        status: 'open',
      })
      continue
    }

    const previousStatus = previousFieldMeta[fieldId]?.status
    const aiCanRefreshField = previousStatus === 'suggested' || previousStatus === 'review'
    if (currentHasContent && !aiCanRefreshField) {
      if (REVIEW_REQUIRED_FIELDS.has(fieldId) || meta.requiresReview) {
        suggestions.push({
          id: `review-existing-${fieldId}-${meta.evidence[0]?.sequence || 0}`,
          category: 'documentation',
          title: `Conferir ${clinicalFieldLabel(fieldId)}`,
          message: 'A conversa trouxe um novo valor para um campo já preenchido. Compare antes de substituir.',
          field: fieldId,
          proposedValue: valueToSuggestion(value),
          evidence: meta.evidence,
          status: 'open',
        })
      }
      continue
    }

    automatic[fieldId] = currentHasContent
      ? mergeSafeClinicalValue(fieldId, current[fieldId], value) as never
      : value as never

    if (REVIEW_REQUIRED_FIELDS.has(fieldId) || meta.requiresReview) {
      suggestions.push({
        id: `review-${fieldId}-${meta.evidence[0]?.sequence || 0}`,
        category: 'documentation',
        title: `Confirmar ${clinicalFieldLabel(fieldId)}`,
        message: 'Dado explícito inserido no prontuário pela IA. Confirme a transcrição e o valor.',
        field: fieldId,
        proposedValue: valueToSuggestion(automatic[fieldId]),
        evidence: meta.evidence,
        status: 'open',
      })
    }
  }

  return { extracted: automatic, suggestions }
}

function getTemplateId(value: string | null | undefined, specialty?: string | null): ClinicalTemplateId {
  if (value && Object.prototype.hasOwnProperty.call({
    clinica_geral: true,
    pediatria: true,
    ginecologia_obstetricia: true,
    psiquiatria: true,
    cardiologia: true,
  }, value)) return value as ClinicalTemplateId

  return resolveClinicalTemplate(specialty)
}

function buildSnapshot(consultation: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {}
  for (const field of CLINICAL_FIELDS) snapshot[field] = consultation[field] ?? null
  return snapshot
}

function normalizeTranscriptForCompare(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

async function buildRawTranscriptPayload(consultationId: string, currentTranscript?: string | null) {
  const segments = await getPrisma().consultationTranscriptSegment.findMany({
    where: { consultationId },
    orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  })

  if (!segments.length) {
    return {
      rawTranscript: currentTranscript || '',
      currentTranscript: currentTranscript || null,
      hasEditedTranscript: false,
      segmentCount: 0,
      segments: [] as Array<{
        id: string
        itemId: string
        sequence: number
        text: string
        source: string
        kind: string
        createdAt: string
      }>,
    }
  }

  const rawTranscript = segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join('\n')

  return {
    rawTranscript,
    currentTranscript: currentTranscript || null,
    hasEditedTranscript:
      normalizeTranscriptForCompare(rawTranscript) !== normalizeTranscriptForCompare(currentTranscript),
    segmentCount: segments.length,
    segments: segments.map((segment) => ({
      id: segment.id,
      itemId: segment.itemId,
      sequence: segment.sequence,
      text: segment.text,
      source: segment.source,
      kind: segment.kind,
      createdAt: segment.createdAt.toISOString(),
    })),
  }
}

async function persistTranscriptSegment(input: {
  consultationId: string
  itemId: string
  text: string
  source: string
  kind: string
  payload?: string
}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await getPrisma().$transaction(async (tx) => {
    const consultation = await tx.consultation.findUnique({
      where: { id: input.consultationId },
      select: { transcript: true },
    })

    if (!consultation) throw new Error('Consulta nao encontrada')

    const existingSegment = await tx.consultationTranscriptSegment.findUnique({
      where: {
        consultationId_itemId: {
          consultationId: input.consultationId,
          itemId: input.itemId,
        },
      },
      select: { id: true },
    })

    if (existingSegment) {
      return {
        appendedText: '',
        fullTranscript: consultation.transcript || null,
      }
    }

    const aggregate = await tx.consultationTranscriptSegment.aggregate({
      where: { consultationId: input.consultationId },
      _max: { sequence: true },
    })

    await tx.consultationTranscriptSegment.create({
      data: {
        consultationId: input.consultationId,
        itemId: input.itemId,
        sequence: (aggregate._max.sequence || 0) + 1,
        text: input.text,
        source: input.source,
        kind: input.kind,
        payload: input.payload || null,
      },
    })

    const previousTranscript = consultation.transcript || ''
    const fullTranscript = previousTranscript ? `${previousTranscript} ${input.text}` : input.text

    await tx.consultation.update({
      where: { id: input.consultationId },
      data: { transcript: fullTranscript },
    })

    return {
      appendedText: input.text,
      fullTranscript,
    }
      })
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: unknown }).code)
        : ''
      if ((code === 'P2002' || code === 'P2034') && attempt < 3) continue
      throw error
    }
  }
  throw new Error('Nao foi possivel ordenar o segmento de transcricao')
}

async function findOwnedConsultation(
  id: string,
  userId: string
) {
  return getPrisma().consultation.findFirst({
    where: { id, userId },
    include: { patient: true, schedule: true, aiState: true },
  })
}

export async function createConsultation(
  req: FastifyRequest<{ Body: { patientId?: string; scheduledAt?: string; status?: string } }>,
  reply: FastifyReply
) {
  void req
  return reply.status(400).send({
    error: 'Novas consultas devem ser criadas pela agenda do medico',
  })
}

export async function startConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const updated = await getPrisma().$transaction(async (tx) => {
      const consultation = await tx.consultation.findFirst({
        where: { id: req.params.id, userId: req.authUser!.id },
        include: { patient: true, schedule: true, aiState: true },
      })

      if (!consultation) return null

      if (consultation.formMode === 'dynamic' && !isDynamicPsychologyEnabled()) {
        throw new Error('Os formularios dinamicos de Psicologia estao desativados')
      }

      const normalizedStatus = normalizeConsultationStatus(consultation.status)
      if (normalizedStatus === CONSULTATION_STATUS.FINISHED) {
        throw new Error('Consulta finalizada nao pode ser iniciada novamente')
      }
      if (
        normalizedStatus === CONSULTATION_STATUS.CANCELED ||
        normalizedStatus === CONSULTATION_STATUS.NO_SHOW
      ) {
        throw new Error('Agendamento cancelado ou marcado como falta nao pode ser iniciado')
      }

      if (normalizedStatus === CONSULTATION_STATUS.IN_PROGRESS) {
        return consultation
      }

      const activeConsultation = await tx.consultation.findFirst({
        where: {
          userId: req.authUser!.id,
          status: { in: [CONSULTATION_STATUS.IN_PROGRESS, 'active'] },
          NOT: { id: consultation.id },
        },
        select: { id: true },
      })

      if (activeConsultation) {
        throw new Error('Ja existe outra consulta em andamento para este medico')
      }

      return tx.consultation.update({
        where: { id: consultation.id },
        data: {
          status: CONSULTATION_STATUS.IN_PROGRESS,
          startedAt: consultation.startedAt || new Date(),
        },
        include: { patient: true, schedule: true, aiState: true },
      })
    })

    if (!updated) return reply.status(404).send({ error: 'Consulta nao encontrada' })
    return reply.send(updated)
  } catch (error) {
    return reply.status(409).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel iniciar a consulta',
    })
  }
}

export async function closeConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })

  if (
    resolveClinicalRecordEngine(consultation.formMode).formMode === 'dynamic' &&
    normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.FINISHED
  ) {
    return reply.status(409).send({
      error: 'Confirme uma evolucao dinamica revisada antes de encerrar a consulta',
    })
  }

  const normalizedStatus = normalizeConsultationStatus(consultation.status)
  if (normalizedStatus === CONSULTATION_STATUS.WAITING) {
    return reply.status(409).send({ error: 'Inicie a consulta antes de encerrar' })
  }

  if (normalizedStatus === CONSULTATION_STATUS.FINISHED) {
    return reply.send(consultation)
  }

  const updated = await getPrisma().consultation.update({
    where: { id: consultation.id },
    data: {
      status: CONSULTATION_STATUS.FINISHED,
      startedAt: consultation.startedAt || new Date(),
      finishedAt: consultation.finishedAt || new Date(),
    },
    include: { patient: true, schedule: true, aiState: true },
  })

  return reply.send(updated)
}

export async function getConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: req.params.id, userId: req.authUser!.id },
    include: { patient: true, schedule: true, aiState: true },
  })

  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  return reply.send(consultation)
}

export async function updateConsultation(
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
  reply: FastifyReply
) {
  const existing = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!existing) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (resolveClinicalRecordEngine(existing.formMode).formMode === 'dynamic') {
    return reply.status(409).send({ error: 'Use o autosave do formulario dinamico para esta consulta' })
  }

  const body = (req.body || {}) as Record<string, unknown>
  const data = pickLegacyConsultationUpdate(body)
  const manualFields = Array.isArray(body.manualFields)
    ? body.manualFields.filter(
      (field): field is ClinicalFieldId =>
        typeof field === 'string' && CLINICAL_FIELD_IDS.includes(field as ClinicalFieldId)
    )
    : []

  const prisma = getPrisma()
  const consultation = await prisma.$transaction(async (tx) => {
    if (manualFields.length) {
      const templateId = getTemplateId(existing.aiState?.templateId, existing.schedule?.specialty)
      const aiState = await tx.consultationAiState.upsert({
        where: { consultationId: existing.id },
        create: { consultationId: existing.id, templateId },
        update: {},
      })
      const fieldMeta = parseFieldMeta(aiState.fieldMetaJson)

      for (const field of manualFields) {
        const previous = fieldMeta[field]
        fieldMeta[field] = previous
          ? { ...previous, status: 'manual' }
          : {
            field,
            status: 'manual',
            source: 'unknown',
            speaker: 'Indefinido',
            confidence: 'high',
            requiresReview: false,
            evidence: [],
          }
      }

      await tx.consultationAiState.update({
        where: { id: aiState.id },
        data: { fieldMetaJson: JSON.stringify(fieldMeta) },
      })
    }

    return tx.consultation.update({
      where: { id: existing.id },
      data,
      include: { patient: true, schedule: true, aiState: true },
    })
  })

  return reply.send(consultation)
}

export async function transcribeChunk(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  const engine = resolveClinicalRecordEngine(consultation.formMode)
  if (engine.formMode === 'dynamic' && normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.IN_PROGRESS) {
    return reply.status(409).send({ error: 'A gravacao so e permitida durante uma consulta em andamento' })
  }
  if (engine.requiresRecordingConsent) {
    await assertDynamicRecordingConsent(consultation.id, req.authUser!.id)
  }

  const fileData = await req.file()
  if (!fileData) return reply.status(400).send({ error: 'Nenhum arquivo de audio recebido' })

  const buffer = await fileData.toBuffer()
  const mimeType = fileData.mimetype || 'audio/webm'
  const chunkTranscript = await transcribeAudioBuffer(buffer, mimeType)

  if (!chunkTranscript.trim()) {
    return reply.send({ chunkTranscript: '', fullTranscript: consultation.transcript || null })
  }

  const persisted = await persistTranscriptSegment({
    consultationId: consultation.id,
    itemId: `legacy-${Date.now()}-${randomUUID()}`,
    text: chunkTranscript,
    source: 'whisper_chunk',
    kind: 'transcribed_chunk',
  })

  return reply.send({
    chunkTranscript: persisted.appendedText,
    fullTranscript: persisted.fullTranscript,
  })
}

export async function createRealtimeToken(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  const engine = resolveClinicalRecordEngine(consultation.formMode)
  if (engine.formMode === 'dynamic' && normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.IN_PROGRESS) {
    return reply.status(409).send({ error: 'A gravacao so e permitida durante uma consulta em andamento' })
  }
  if (engine.requiresRecordingConsent) {
    await assertDynamicRecordingConsent(consultation.id, req.authUser!.id)
  }

  try {
    const clientSecret = await createRealtimeClientSecret(req.authUser!.id)
    return reply.send(clientSecret)
  } catch (error) {
    console.error('[realtime] Erro ao criar client_secret:', error)
    return reply.status(502).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel iniciar a sessao realtime',
    })
  }
}

export async function appendRealtimeTranscript(
  req: FastifyRequest<{
    Params: { id: string }
    Body: { itemId?: string; text?: string; payload?: Record<string, unknown> }
  }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  const engine = resolveClinicalRecordEngine(consultation.formMode)
  if (engine.formMode === 'dynamic' && normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.IN_PROGRESS) {
    return reply.status(409).send({ error: 'A transcricao so pode ser alterada durante uma consulta em andamento' })
  }
  if (engine.requiresRecordingConsent) {
    await assertDynamicRecordingConsent(consultation.id, req.authUser!.id)
  }

  const itemId = req.body?.itemId?.trim()
  const text = req.body?.text?.trim()
  if (!itemId || !text) {
    return reply.send({ appendedText: '', fullTranscript: consultation.transcript || null })
  }
  if (itemId.length > 200) {
    return reply.status(400).send({ error: 'O identificador do segmento e muito longo' })
  }
  if (text.length > 50_000) {
    return reply.status(400).send({ error: 'O segmento de transcricao excede o limite permitido' })
  }
  const payload = req.body?.payload ? JSON.stringify(req.body.payload) : undefined
  if (payload && payload.length > 20_000) {
    return reply.status(400).send({ error: 'Os metadados do segmento excedem o limite permitido' })
  }

  const persisted = await persistTranscriptSegment({
    consultationId: consultation.id,
    itemId,
    text,
    source: 'openai_realtime',
    kind: 'completed',
    payload,
  })

  return reply.send(persisted)
}

export async function getRawTranscript(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: req.params.id, userId: req.authUser!.id },
    select: { id: true, transcript: true },
  })

  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })

  await recordSensitiveAccess({
    actorUserId: req.authUser!.id,
    consultationId: consultation.id,
    dataClass: 'transcricao_consulta',
    action: 'visualizar_transcricao',
    requestId: req.id,
  })
  const payload = await buildRawTranscriptPayload(consultation.id, consultation.transcript)
  return reply.send(payload)
}

export async function reinterpretConsultation(
  req: FastifyRequest<{ Params: { id: string }; Body: { force?: boolean } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (resolveClinicalRecordEngine(consultation.formMode).formMode === 'dynamic') {
    return reinterpretDynamicConsultation(req, reply)
  }
  if (!consultation.transcript?.trim()) return reply.send({ extracted: {}, suggestions: [], fieldMeta: {} })

  if (process.env.AI_PIPELINE_V2 === 'false') {
    const extracted = await reinterpretFullTranscript(consultation.transcript)
    return reply.send({
      extracted,
      suggestions: [],
      fieldMeta: {},
      processing: false,
      templateId: 'clinica_geral',
      legacy: true,
    })
  }

  const prisma = getPrisma()
  const templateId = getTemplateId(consultation.aiState?.templateId, consultation.schedule?.specialty)
  let aiState = await prisma.consultationAiState.upsert({
    where: { consultationId: consultation.id },
    create: { consultationId: consultation.id, templateId },
    update: {},
  })

  if (req.body?.force) {
    aiState = await prisma.consultationAiState.update({
      where: { id: aiState.id },
      data: {
        lastProcessedSequence: 0,
        processingThroughSequence: null,
        processingStartedAt: null,
      },
    })
  }

  if (
    aiState.processingThroughSequence != null &&
    aiState.processingStartedAt &&
    Date.now() - aiState.processingStartedAt.getTime() > AI_PROCESSING_LEASE_MS
  ) {
    aiState = await prisma.consultationAiState.update({
      where: { id: aiState.id },
      data: { processingThroughSequence: null, processingStartedAt: null },
    })
  }

  if (aiState.processingThroughSequence != null) {
    return reply.send({
      extracted: {},
      suggestions: parseSuggestions(aiState.suggestionsJson),
      fieldMeta: parseFieldMeta(aiState.fieldMetaJson),
      processedThroughSequence: aiState.lastProcessedSequence,
      processing: true,
      templateId: aiState.templateId,
    })
  }

  const segments = await prisma.consultationTranscriptSegment.findMany({
    where: { consultationId: consultation.id },
    orderBy: { sequence: 'asc' },
  })
  const rawTranscript = segments.map((segment) => segment.text.trim()).filter(Boolean).join('\n')
  const hasEditedTranscript = normalizeTranscriptForCompare(rawTranscript) !== normalizeTranscriptForCompare(consultation.transcript)
  const lastSequence = segments.at(-1)?.sequence || 0
  const inputSegments = hasEditedTranscript || !segments.length
    ? [{ id: 'edited-transcript', sequence: Math.max(1, lastSequence), text: consultation.transcript }]
    : segments
      .filter((segment) => segment.sequence > aiState.lastProcessedSequence)
      .map((segment) => ({ id: segment.id, sequence: segment.sequence, text: segment.text }))

  if (!inputSegments.length) {
    return reply.send({
      extracted: {},
      suggestions: parseSuggestions(aiState.suggestionsJson),
      fieldMeta: parseFieldMeta(aiState.fieldMetaJson),
      processedThroughSequence: aiState.lastProcessedSequence,
      processing: false,
      templateId: aiState.templateId,
    })
  }

  const processingThroughSequence = inputSegments.at(-1)?.sequence || aiState.lastProcessedSequence
  const enableClinicalSuggestions = Boolean(
    req.body?.force || processingThroughSequence % AI_CLINICAL_REASONING_EVERY_SEGMENTS === 0
  )
  const evidenceSegments = enableClinicalSuggestions
    ? segments.slice(-AI_CLINICAL_REASONING_CONTEXT_SEGMENTS).map((segment) => ({
      id: segment.id,
      sequence: segment.sequence,
      text: segment.text,
    }))
    : undefined
  const claim = await prisma.consultationAiState.updateMany({
    where: { id: aiState.id, processingThroughSequence: null },
    data: { processingThroughSequence, processingStartedAt: new Date() },
  })

  if (!claim.count) {
    return reply.send({ extracted: {}, suggestions: [], fieldMeta: {}, processing: true, templateId: aiState.templateId })
  }

  try {
    const output = await extractClinicalDelta({
      templateId: aiState.templateId as ClinicalTemplateId,
      clinicalState: buildClinicalState(consultation as unknown as Record<string, unknown>),
      segments: inputSegments,
      evidenceSegments,
      enableClinicalSuggestions,
    })
    const latestConsultation = await findOwnedConsultation(consultation.id, req.authUser!.id)
    if (!latestConsultation) throw new Error('Consulta nao encontrada durante a interpretacao')

    const latestAiState = latestConsultation.aiState || aiState
    const previousFieldMeta = parseFieldMeta(latestAiState.fieldMetaJson)
    const fieldMeta = mergeFieldMeta(previousFieldMeta, output.fieldMeta)
    const automatic = filterAutomaticExtracted(
      latestConsultation as unknown as Record<string, unknown>,
      output.extracted,
      fieldMeta,
      previousFieldMeta
    )
    const suggestions = [...output.suggestions, ...automatic.suggestions]
    const mergedSuggestions = Array.from(
      new Map([...parseSuggestions(latestAiState.suggestionsJson), ...suggestions].map((item) => [item.id, item])).values()
    )
    const specialtyData = mergeSpecialtyData(latestConsultation.specialtyData, output.specialtyData)
    const shadow = process.env.AI_PIPELINE_V2_SHADOW === 'true'
    const clinicalUpdates = serializeExtractedToDb(automatic.extracted)
    const consultationData = {
      ...clinicalUpdates,
      ...(specialtyData && !shadow ? { specialtyData } : {}),
    }

    await prisma.$transaction([
      prisma.consultationAiState.update({
        where: { id: aiState.id },
        data: {
          lastProcessedSequence: processingThroughSequence,
          processingThroughSequence: null,
          processingStartedAt: null,
          fieldMetaJson: JSON.stringify(fieldMeta),
          suggestionsJson: JSON.stringify(mergedSuggestions),
        },
      }),
      ...(Object.keys(consultationData).length && !shadow
        ? [prisma.consultation.update({ where: { id: consultation.id }, data: consultationData })]
        : []),
    ])

    return reply.send({
      extracted: shadow ? {} : automatic.extracted,
      suggestions: mergedSuggestions,
      fieldMeta,
      specialtyData: output.specialtyData,
      processedThroughSequence: processingThroughSequence,
      processing: false,
      templateId: aiState.templateId,
      shadow,
    })
  } catch (error) {
    await prisma.consultationAiState.update({
      where: { id: aiState.id },
      data: { processingThroughSequence: null, processingStartedAt: null },
    })
    throw error
  }
}

export async function updateAiState(
  req: FastifyRequest<{
    Params: { id: string }
    Body: {
      action?: 'accept' | 'dismiss'
      suggestionId?: string
      field?: ClinicalFieldId
      templateId?: ClinicalTemplateId
    }
  }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (resolveClinicalRecordEngine(consultation.formMode).formMode === 'dynamic') {
    return reply.status(409).send({ error: 'Use a central de revisao do formulario dinamico' })
  }

  const requestedTemplate = req.body?.templateId
  if (requestedTemplate && !Object.prototype.hasOwnProperty.call({
    clinica_geral: true,
    pediatria: true,
    ginecologia_obstetricia: true,
    psiquiatria: true,
    cardiologia: true,
  }, requestedTemplate)) {
    return reply.status(400).send({ error: 'Template clinico invalido' })
  }

  const prisma = getPrisma()
  const defaultTemplate = getTemplateId(consultation.aiState?.templateId, consultation.schedule?.specialty)
  const current = await prisma.consultationAiState.upsert({
    where: { consultationId: consultation.id },
    create: { consultationId: consultation.id, templateId: defaultTemplate },
    update: {},
  })
  const fieldMeta = parseFieldMeta(current.fieldMetaJson)
  const suggestions = parseSuggestions(current.suggestionsJson)
  const action = req.body?.action
  const suggestionId = req.body?.suggestionId
  const field = req.body?.field

  if (action && !suggestionId) {
    return reply.status(400).send({ error: 'Informe a sugestao para registrar a revisao' })
  }

  const nextSuggestions = suggestions.map((item) =>
    item.id === suggestionId ? { ...item, status: action === 'accept' ? 'accepted' as const : 'dismissed' as const } : item
  )
  const nextFieldMeta = field && fieldMeta[field]
    ? {
      ...fieldMeta,
      [field]: {
        ...fieldMeta[field],
        status: action === 'accept' ? 'accepted' : 'dismissed',
      },
    }
    : fieldMeta
  const templateChanged = Boolean(requestedTemplate && requestedTemplate !== current.templateId)
  const updated = await prisma.consultationAiState.update({
    where: { id: current.id },
    data: {
      templateId: requestedTemplate || current.templateId,
      lastProcessedSequence: templateChanged ? 0 : current.lastProcessedSequence,
      processingThroughSequence: null,
      processingStartedAt: null,
      fieldMetaJson: JSON.stringify(nextFieldMeta),
      suggestionsJson: JSON.stringify(nextSuggestions),
    },
  })

  return reply.send({
    templateId: updated.templateId,
    fieldMeta: parseFieldMeta(updated.fieldMetaJson),
    suggestions: parseSuggestions(updated.suggestionsJson),
  })
}

export async function saveAudio(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  const engine = resolveClinicalRecordEngine(consultation.formMode)
  if (engine.formMode === 'dynamic' && normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.IN_PROGRESS) {
    return reply.status(409).send({ error: 'O audio so pode ser salvo durante uma consulta em andamento' })
  }
  if (engine.requiresRecordingConsent) {
    await assertDynamicRecordingConsent(consultation.id, req.authUser!.id)
  }

  const fileData = await req.file()
  if (!fileData) return reply.status(400).send({ error: 'Nenhum arquivo de audio' })

  const buffer = await fileData.toBuffer()
  const mimeType = fileData.mimetype || 'audio/webm'
  const savedAudio = await saveFullAudio(consultation.id, buffer, mimeType)
  const audioSavedAt = new Date()
  const retentionPolicy = await getPrisma().audioRetentionPolicy.findUnique({
    where: { userId: req.authUser!.id },
  })
  const retentionDays = Math.max(1825, retentionPolicy?.audioRetentionDays || 1825)
  const audioDeleteAt = retentionPolicy?.legalHold
    ? null
    : new Date(audioSavedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000)

  const prisma = getPrisma()
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.consultation.updateMany({
        where: {
          id: consultation.id,
          userId: req.authUser!.id,
          audioPath: consultation.audioPath || null,
        },
        data: {
          audioPath: savedAudio.filePath,
          audioSavedAt,
          audioEncrypted: savedAudio.encrypted,
          audioDeleteAt,
        },
      })
      if (claimed.count !== 1) {
        throw new AudioSaveConflictError('O audio foi alterado em outra sessao')
      }
      if (consultation.audioPath && consultation.audioPath !== savedAudio.filePath) {
        await tx.pendingAudioDeletion.upsert({
          where: { filePath: consultation.audioPath },
          create: {
            filePath: consultation.audioPath,
            userId: req.authUser!.id,
            consultationId: consultation.id,
            reason: 'Arquivo substituido por uma nova gravacao',
          },
          update: {
            userId: req.authUser!.id,
            consultationId: consultation.id,
            reason: 'Arquivo substituido por uma nova gravacao',
            nextAttemptAt: new Date(),
            lastError: null,
          },
        })
      }
    })
  } catch (error) {
    await enqueuePendingAudioDeletion({
      filePath: savedAudio.filePath,
      userId: req.authUser!.id,
      consultationId: consultation.id,
      reason: 'Arquivo novo removido apos falha ao atualizar a consulta',
    }).catch(async () => {
      await removeStoredAudio(savedAudio.filePath).catch(() => undefined)
    })
    await processPendingAudioDeletions().catch(() => undefined)
    if (error instanceof AudioSaveConflictError) {
      return reply.status(409).send({ error: error.message })
    }
    throw error
  }
  await processPendingAudioDeletions().catch((error) => {
    req.log.error({ requestId: req.id, name: error instanceof Error ? error.name : 'Error' }, 'Falha ao processar fila de audio')
  })

  return reply.send({
    audioPath: savedAudio.filePath,
    savedAt: audioSavedAt,
    encrypted: savedAudio.encrypted,
    deleteAt: audioDeleteAt,
  })
}

export async function finalizeConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)

  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (resolveClinicalRecordEngine(consultation.formMode).formMode === 'dynamic') {
    return generateDynamicDocument(req as FastifyRequest<{
      Params: { id: string }
      Body: { format?: 'SOAP' | 'DAP' | 'BIRP'; documentKind?: 'compartilhavel' | 'restrito' }
    }>, reply)
  }
  const normalizedStatus = normalizeConsultationStatus(consultation.status)
  if (normalizedStatus === CONSULTATION_STATUS.WAITING) {
    return reply.status(409).send({ error: 'Inicie a consulta antes de finalizar' })
  }

  if (!consultation.transcript) {
    return reply.status(400).send({ error: 'Nenhuma transcricao disponivel para revisao' })
  }

  const prisma = getPrisma()
  const templateId = getTemplateId(consultation.aiState?.templateId, consultation.schedule?.specialty)
  const aiState = await prisma.consultationAiState.upsert({
    where: { consultationId: consultation.id },
    create: { consultationId: consultation.id, templateId },
    update: {},
  })
  const review = await runFinalReview({
    transcript: consultation.transcript,
    audioPath: consultation.audioPath,
    templateId: aiState.templateId as ClinicalTemplateId,
    clinicalState: buildClinicalState(consultation as unknown as Record<string, unknown>),
  })
  const previousFieldMeta = parseFieldMeta(aiState.fieldMetaJson)
  const fieldMeta = mergeFieldMeta(previousFieldMeta, review.fieldMeta)
  const automatic = filterAutomaticExtracted(
    consultation as unknown as Record<string, unknown>,
    review.extracted,
    fieldMeta,
    previousFieldMeta
  )
  const suggestions = Array.from(
    new Map(
      [...parseSuggestions(aiState.suggestionsJson), ...review.suggestions, ...automatic.suggestions]
        .map((item) => [item.id, item])
    ).values()
  )
  const fieldUpdates = serializeExtractedToDb(automatic.extracted)
  const specialtyData = mergeSpecialtyData(consultation.specialtyData, review.specialtyData)

  await prisma.$transaction([
    prisma.consultation.update({
      where: { id: consultation.id },
      data: {
        ...fieldUpdates,
        ...(specialtyData ? { specialtyData } : {}),
        transcriptStructured: JSON.stringify(review.turns),
        ...review.soap,
        status: CONSULTATION_STATUS.FINISHED,
        startedAt: consultation.startedAt || new Date(),
        finishedAt: consultation.finishedAt || new Date(),
      },
    }),
    prisma.consultationAiState.update({
      where: { id: aiState.id },
      data: {
        fieldMetaJson: JSON.stringify(fieldMeta),
        suggestionsJson: JSON.stringify(suggestions),
        finalReviewAt: new Date(),
        processingThroughSequence: null,
        processingStartedAt: null,
      },
    }),
  ])

  return reply.send({
    soap: review.soap,
    extracted: automatic.extracted,
    turns: review.turns,
    suggestions,
    fieldMeta,
    templateId: aiState.templateId,
  })
}

export async function listPatientConsultations(
  req: FastifyRequest<{ Params: { patientId: string } }>,
  reply: FastifyReply
) {
  const patient = await getPrisma().patient.findFirst({
    where: { id: req.params.patientId, userId: req.authUser!.id },
    select: { id: true },
  })

  if (!patient) return reply.status(404).send({ error: 'Paciente nao encontrado' })

  const consultations = await getPrisma().consultation.findMany({
    where: { patientId: patient.id, userId: req.authUser!.id },
    orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
    include: { patient: { select: { name: true } }, schedule: true },
  })

  return reply.send(consultations)
}

export async function streamAudio(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: req.params.id, userId: req.authUser!.id },
    select: { id: true, audioPath: true },
  })

  if (!consultation?.audioPath) {
    return reply.status(404).send({ error: 'Audio nao encontrado' })
  }

  let audio: Buffer
  try {
    audio = await readFullAudio(consultation.audioPath)
  } catch {
    return reply.status(404).send({ error: 'Audio nao encontrado' })
  }

  await recordSensitiveAccess({
    actorUserId: req.authUser!.id,
    consultationId: consultation.id,
    dataClass: 'audio_consulta',
    action: 'reproduzir_audio',
    requestId: req.id,
  })

  const contentType = consultation.audioPath.includes('.mp3') ? 'audio/mpeg' : 'audio/webm'
  return reply
    .header('Cache-Control', 'no-store')
    .header('X-Content-Type-Options', 'nosniff')
    .type(contentType)
    .send(audio)
}

export async function getConversationTopics(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: req.params.id, userId: req.authUser!.id },
    select: { id: true, transcript: true, formMode: true },
  })

  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (resolveClinicalRecordEngine(consultation.formMode).formMode === 'dynamic') {
    return getDynamicConversationTopics(req, reply)
  }
  const rawPayload = await buildRawTranscriptPayload(consultation.id, consultation.transcript)
  const sourceTranscript = rawPayload.rawTranscript.trim() || consultation.transcript?.trim() || ''
  if (!sourceTranscript) return reply.send({ topics: [] })

  const topics = await suggestTopics(sourceTranscript)
  return reply.send({ topics })
}

export async function createVersion(
  req: FastifyRequest<{
    Params: { id: string }
    Body: { newTranscript?: string; reason?: string; editDiff?: { before: string; after: string } }
  }>,
  reply: FastifyReply
) {
  const newTranscript = req.body?.newTranscript?.trim() || ''
  if (!newTranscript) {
    return reply.status(400).send({ error: 'Transcricao editada nao pode ser vazia' })
  }

  const current = await getPrisma().consultation.findFirst({
    where: { id: req.params.id, userId: req.authUser!.id },
  })

  if (!current) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (resolveClinicalRecordEngine(current.formMode).formMode === 'dynamic') {
    return createDynamicTranscriptVersion(req, reply)
  }

  const count = await getPrisma().consultationVersion.count({
    where: { consultationId: current.id },
  })

  await getPrisma().consultationVersion.create({
    data: {
      consultationId: current.id,
      version: count + 1,
      snapshot: JSON.stringify(buildSnapshot(current as unknown as Record<string, unknown>)),
      transcript: current.transcript,
      reason: req.body?.reason?.trim() || 'Edicao da transcricao',
      editDiff: req.body?.editDiff ? JSON.stringify(req.body.editDiff) : null,
    },
  })

  const extracted = await reinterpretFullTranscript(newTranscript)
  const fieldUpdates = serializeExtractedToDb(extracted)
  const nonDestructiveUpdates = Object.fromEntries(
    Object.entries(fieldUpdates).filter(([field]) => !hasClinicalContent((current as unknown as Record<string, unknown>)[field]))
  )

  const prisma = getPrisma()
  const templateId = resolveClinicalTemplate((await prisma.schedule.findUnique({ where: { id: current.scheduleId || '' }, select: { specialty: true } }))?.specialty)
  const updated = await prisma.consultation.update({
    where: { id: current.id },
    data: { ...nonDestructiveUpdates, transcript: newTranscript },
    include: { patient: true, schedule: true, aiState: true },
  })

  await prisma.consultationAiState.upsert({
    where: { consultationId: current.id },
    create: { consultationId: current.id, templateId, lastProcessedSequence: 0 },
    update: {
      lastProcessedSequence: 0,
      processingThroughSequence: null,
      processingStartedAt: null,
      suggestionsJson: '[]',
    },
  })

  return reply.send({ consultation: updated, extracted, savedVersion: count + 1 })
}

export async function listVersions(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })

  const versions = await getPrisma().consultationVersion.findMany({
    where: { consultationId: consultation.id },
    orderBy: { version: 'desc' },
  })

  return reply.send(versions)
}
