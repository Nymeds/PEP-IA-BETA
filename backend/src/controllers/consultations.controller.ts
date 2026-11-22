import { randomUUID } from 'crypto'
import { FastifyReply, FastifyRequest } from 'fastify'
import { getPrisma } from '../lib/prisma'
import { transcribeAudioBuffer, saveFullAudio, readFullAudio, removeStoredAudio } from '../services/speech.service'
import { createRealtimeClientSecret } from '../services/realtime.service'
import { migrateOwnedRecordsToDynamic } from '../services/form-templates.service'
import { recordSensitiveAccess } from '../services/access-audit.service'
import {
  enqueuePendingAudioDeletion,
  processPendingAudioDeletions,
} from '../services/retention.service'
import {
  assertDynamicRecordingConsent,
} from './dynamic-consultations.controller'
import {
  CONSULTATION_STATUS,
  normalizeConsultationStatus,
} from '../lib/schedule'

class AudioSaveConflictError extends Error {}

class ConsultationStartConflictError extends Error {
  constructor(
    message: string,
    readonly code: string = 'CONSULTATION_START_CONFLICT'
  ) {
    super(message)
    this.name = 'ConsultationStartConflictError'
  }
}

class ActiveConsultationExistsError extends ConsultationStartConflictError {
  constructor(
    readonly activeConsultation: {
      id: string
      patientName: string
      startedAt: string | null
      scheduleTitle: string | null
    }
  ) {
    super(
      'Já existe outra consulta em andamento para este médico',
      'ACTIVE_CONSULTATION_EXISTS'
    )
    this.name = 'ActiveConsultationExistsError'
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

export async function startConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    await migrateOwnedRecordsToDynamic(req.authUser!.id)
    const updated = await getPrisma().$transaction(async (tx) => {
      const consultation = await tx.consultation.findFirst({
        where: { id: req.params.id, userId: req.authUser!.id },
        include: { patient: true, schedule: true, aiState: true },
      })

      if (!consultation) return null

      if (!consultation.formTemplateVersionId) {
        throw new ConsultationStartConflictError(
          'A consulta nao possui uma versao de formulario publicada',
          'FORM_TEMPLATE_VERSION_REQUIRED'
        )
      }

      const normalizedStatus = normalizeConsultationStatus(consultation.status)
      if (normalizedStatus === CONSULTATION_STATUS.FINISHED) {
        throw new ConsultationStartConflictError(
          'Consulta finalizada nao pode ser iniciada novamente',
          'CONSULTATION_ALREADY_FINISHED'
        )
      }
      if (
        normalizedStatus === CONSULTATION_STATUS.CANCELED ||
        normalizedStatus === CONSULTATION_STATUS.NO_SHOW
      ) {
        throw new ConsultationStartConflictError(
          'Agendamento cancelado ou marcado como falta nao pode ser iniciado',
          'CONSULTATION_NOT_STARTABLE'
        )
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
        select: {
          id: true,
          startedAt: true,
          patient: { select: { name: true } },
          schedule: { select: { title: true } },
        },
      })

      if (activeConsultation) {
        throw new ActiveConsultationExistsError({
          id: activeConsultation.id,
          patientName: activeConsultation.patient.name,
          startedAt: activeConsultation.startedAt?.toISOString() || null,
          scheduleTitle: activeConsultation.schedule?.title || null,
        })
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
    if (error instanceof ActiveConsultationExistsError) {
      return reply.status(409).send({
        error: error.message,
        code: error.code,
        activeConsultation: error.activeConsultation,
      })
    }
    if (error instanceof ConsultationStartConflictError) {
      return reply.status(409).send({ error: error.message, code: error.code })
    }

    req.log.error(
      { err: error, consultationId: req.params.id },
      'Falha inesperada ao iniciar consulta'
    )
    return reply.status(500).send({
      error: 'Nao foi possivel iniciar a consulta',
      code: 'CONSULTATION_START_FAILED',
    })
  }
}

export async function getConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  await migrateOwnedRecordsToDynamic(req.authUser!.id)
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: req.params.id, userId: req.authUser!.id },
    include: { patient: true, schedule: true, aiState: true },
  })

  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  return reply.send(consultation)
}

export async function transcribeChunk(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.IN_PROGRESS) {
    return reply.status(409).send({ error: 'A gravacao so e permitida durante uma consulta em andamento' })
  }
  await assertDynamicRecordingConsent(consultation.id, req.authUser!.id)

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
    itemId: `audio-${Date.now()}-${randomUUID()}`,
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
  if (normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.IN_PROGRESS) {
    return reply.status(409).send({ error: 'A gravacao so e permitida durante uma consulta em andamento' })
  }
  await assertDynamicRecordingConsent(consultation.id, req.authUser!.id)

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
  if (normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.IN_PROGRESS) {
    return reply.status(409).send({ error: 'A transcricao so pode ser alterada durante uma consulta em andamento' })
  }
  await assertDynamicRecordingConsent(consultation.id, req.authUser!.id)

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

export async function saveAudio(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.IN_PROGRESS) {
    return reply.status(409).send({ error: 'O audio so pode ser salvo durante uma consulta em andamento' })
  }
  await assertDynamicRecordingConsent(consultation.id, req.authUser!.id)

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
