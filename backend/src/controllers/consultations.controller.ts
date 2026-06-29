import { FastifyReply, FastifyRequest } from 'fastify'
import { createReadStream, existsSync } from 'fs'
import { getPrisma } from '../lib/prisma'
import { transcribeAudioBuffer, saveFullAudio } from '../services/speech.service'
import { reinterpretFullTranscript, serializeExtractedToDb } from '../services/extraction.service'
import { runFinalReview } from '../services/review.service'
import { suggestTopics } from '../services/analysis.service'
import { generateSoap } from '../services/soap.service'
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

function buildSnapshot(consultation: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {}
  for (const field of CLINICAL_FIELDS) snapshot[field] = consultation[field] ?? null
  return snapshot
}

async function findOwnedConsultation(
  id: string,
  userId: string
) {
  return getPrisma().consultation.findFirst({
    where: { id, userId },
    include: { patient: true, schedule: true },
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
        include: { patient: true, schedule: true },
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
        include: { patient: true, schedule: true },
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
    include: { patient: true, schedule: true },
  })

  return reply.send(updated)
}

export async function getConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: req.params.id, userId: req.authUser!.id },
    include: { patient: true, schedule: true },
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

  const consultation = await getPrisma().consultation.update({
    where: { id: existing.id },
    data: data as Record<string, unknown>,
    include: { patient: true, schedule: true },
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

  const previousTranscript = consultation.transcript || ''
  const fullTranscript = previousTranscript ? `${previousTranscript} ${chunkTranscript}` : chunkTranscript

  await getPrisma().consultation.update({
    where: { id: consultation.id },
    data: { transcript: fullTranscript },
  })

  return reply.send({ chunkTranscript, fullTranscript })
}

export async function reinterpretConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: req.params.id, userId: req.authUser!.id },
    select: { transcript: true },
  })

  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (!consultation.transcript?.trim()) return reply.send({ extracted: {} })

  const extracted = await reinterpretFullTranscript(consultation.transcript)
  return reply.send({ extracted })
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
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: req.params.id, userId: req.authUser!.id },
    select: { id: true, transcript: true, status: true, startedAt: true, finishedAt: true },
  })

  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  const normalizedStatus = normalizeConsultationStatus(consultation.status)
  if (normalizedStatus === CONSULTATION_STATUS.WAITING) {
    return reply.status(409).send({ error: 'Inicie a consulta antes de finalizar' })
  }

  if (!consultation.transcript) {
    return reply.status(400).send({ error: 'Nenhuma transcricao disponivel para revisao' })
  }

  const review = await runFinalReview(consultation.transcript)
  const soap = await generateSoap(review.structuredText)
  const fieldUpdates = serializeExtractedToDb(review.extracted)

  await getPrisma().consultation.update({
    where: { id: consultation.id },
    data: {
      ...fieldUpdates,
      transcriptStructured: JSON.stringify(review.turns),
      ...soap,
      status: CONSULTATION_STATUS.FINISHED,
      startedAt: consultation.startedAt || new Date(),
      finishedAt: consultation.finishedAt || new Date(),
    },
  })

  return reply.send({
    soap,
    extracted: review.extracted,
    turns: review.turns,
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
    select: { transcript: true },
  })

  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (!consultation.transcript?.trim()) return reply.send({ topics: [] })

  const topics = await suggestTopics(consultation.transcript)
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

  const updated = await getPrisma().consultation.update({
    where: { id: current.id },
    data: { ...fieldUpdates, transcript: newTranscript },
    include: { patient: true, schedule: true },
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
