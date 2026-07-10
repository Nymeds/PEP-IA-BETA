import { randomUUID } from 'crypto'
import { FastifyReply, FastifyRequest } from 'fastify'
import { createReadStream, existsSync } from 'fs'
import { getPrisma } from '../lib/prisma'
import { transcribeAudioBuffer, saveFullAudio } from '../services/speech.service'
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

const AI_PROCESSING_LEASE_MS = 45_000

function hasClinicalContent(value: unknown) {
  if (value == null) return false
  if (typeof value === 'number') return true
  if (typeof value !== 'string') return true
  const normalized = value.trim()
  return normalized !== '' && normalized !== '[]' && normalized !== '{}' && normalized !== 'null'
}

function buildClinicalState(consultation: Record<string, unknown>) {
  const state: Record<string, unknown> = {}
  for (const field of CLINICAL_FIELDS) {
    const value = consultation[field]
    if (!hasClinicalContent(value)) continue
    state[field] = JSON_CLINICAL_FIELDS.has(field) && typeof value === 'string'
      ? parseJsonSafely(value, value)
      : value
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

function filterAutomaticExtracted(
  current: Record<string, unknown>,
  extracted: ExtractedData,
  fieldMeta: Record<string, FieldProvenance>
) {
  const automatic: ExtractedData = {}
  const suggestions: ClinicalSuggestion[] = []

  for (const [field, value] of Object.entries(extracted)) {
    if (field === 'currentSection' || !CLINICAL_FIELD_IDS.includes(field as ClinicalFieldId)) continue
    const fieldId = field as ClinicalFieldId
    const meta = fieldMeta[fieldId]
    if (!meta?.evidence.length || hasClinicalContent(current[fieldId])) continue

    if (REVIEW_REQUIRED_FIELDS.has(fieldId) || meta.requiresReview || meta.confidence !== 'high') {
      suggestions.push({
        id: `review-${fieldId}-${meta.evidence[0]?.sequence || 0}`,
        category: 'documentation',
        title: `Revisar ${fieldId}`,
        message: 'Informacao identificada pela IA. Confirme antes de incluir no prontuario.',
        field: fieldId,
        proposedValue: valueToSuggestion(value),
        evidence: meta.evidence,
        status: 'open',
      })
      continue
    }

    automatic[fieldId] = value as never
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
  return getPrisma().$transaction(async (tx) => {
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

      const normalizedStatus = normalizeConsultationStatus(consultation.status)
      if (normalizedStatus === CONSULTATION_STATUS.FINISHED) {
        throw new Error('Consulta finalizada nao pode ser iniciada novamente')
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

  const body = (req.body || {}) as Record<string, unknown>
  const {
    id: _id,
    patientId: _patientId,
    userId: _userId,
    scheduleId: _scheduleId,
    status: _status,
    scheduledAt: _scheduledAt,
    startedAt: _startedAt,
    finishedAt: _finishedAt,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    patient: _patient,
    schedule: _schedule,
    versions: _versions,
    aiState: _aiState,
    ...data
  } = body
  void _id
  void _patientId
  void _userId
  void _scheduleId
  void _status
  void _scheduledAt
  void _startedAt
  void _finishedAt
  void _createdAt
  void _updatedAt
  void _patient
  void _schedule
  void _versions
  void _aiState

  const consultation = await getPrisma().consultation.update({
    where: { id: existing.id },
    data: data as Record<string, unknown>,
    include: { patient: true, schedule: true, aiState: true },
  })

  return reply.send(consultation)
}

export async function transcribeChunk(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })

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

  const itemId = req.body?.itemId?.trim()
  const text = req.body?.text?.trim()
  if (!itemId || !text) {
    return reply.send({ appendedText: '', fullTranscript: consultation.transcript || null })
  }

  const persisted = await persistTranscriptSegment({
    consultationId: consultation.id,
    itemId,
    text,
    source: 'openai_realtime',
    kind: 'completed',
    payload: req.body?.payload ? JSON.stringify(req.body.payload) : undefined,
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

  const payload = await buildRawTranscriptPayload(consultation.id, consultation.transcript)
  return reply.send(payload)
}

export async function reinterpretConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
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
    })
    const fieldMeta = mergeFieldMeta(parseFieldMeta(aiState.fieldMetaJson), output.fieldMeta)
    const automatic = filterAutomaticExtracted(
      consultation as unknown as Record<string, unknown>,
      output.extracted,
      fieldMeta
    )
    const suggestions = [...output.suggestions, ...automatic.suggestions]
    const mergedSuggestions = Array.from(
      new Map([...parseSuggestions(aiState.suggestionsJson), ...suggestions].map((item) => [item.id, item])).values()
    )
    const specialtyData = mergeSpecialtyData(consultation.specialtyData, output.specialtyData)
    const shadow = process.env.AI_PIPELINE_V2_SHADOW === 'true'

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
      ...(specialtyData && !shadow
        ? [prisma.consultation.update({ where: { id: consultation.id }, data: { specialtyData } })]
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

  const fileData = await req.file()
  if (!fileData) return reply.status(400).send({ error: 'Nenhum arquivo de audio' })

  const buffer = await fileData.toBuffer()
  const mimeType = fileData.mimetype || 'audio/webm'
  const filePath = await saveFullAudio(consultation.id, buffer, mimeType)

  await getPrisma().consultation.update({
    where: { id: consultation.id },
    data: { audioPath: filePath },
  })

  return reply.send({ audioPath: filePath })
}

export async function finalizeConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)

  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
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
    templateId: aiState.templateId as ClinicalTemplateId,
    clinicalState: buildClinicalState(consultation as unknown as Record<string, unknown>),
  })
  const fieldMeta = mergeFieldMeta(parseFieldMeta(aiState.fieldMetaJson), review.fieldMeta)
  const automatic = filterAutomaticExtracted(
    consultation as unknown as Record<string, unknown>,
    review.extracted,
    fieldMeta
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
    select: { audioPath: true },
  })

  if (!consultation?.audioPath || !existsSync(consultation.audioPath)) {
    return reply.status(404).send({ error: 'Audio nao encontrado' })
  }

  const contentType = consultation.audioPath.endsWith('.mp3') ? 'audio/mpeg' : 'audio/webm'
  return reply.type(contentType).send(createReadStream(consultation.audioPath))
}

export async function getConversationTopics(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: req.params.id, userId: req.authUser!.id },
    select: { id: true, transcript: true },
  })

  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
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
