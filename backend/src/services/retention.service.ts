import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { lstat, unlink } from 'fs/promises'
import path from 'path'
import type { Prisma } from '@prisma/client'
import { getPrisma } from '../lib/prisma'

const AUDIO_ROOT = path.resolve(__dirname, '../../uploads/audio')
const RETENTION_INTERVAL_MS = 60 * 60 * 1000
const RETENTION_REASON = 'Conteudo removido pela politica de retencao'
const MIN_SHARED_RETENTION_YEARS = 20
const MIN_RESTRICTED_RETENTION_YEARS = 5
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

type DocumentKind = 'compartilhavel' | 'restrito'
type JsonObject = Record<string, unknown>

function hashTarget(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function minimalDocumentTombstone(value: unknown, kind: DocumentKind, deletedAt: Date): JsonObject {
  const candidate = isObject(value) ? value : {}
  return {
    ...(typeof candidate.id === 'string' ? { id: candidate.id } : {}),
    kind,
    status: 'excluido_retencao',
    deletedAt: deletedAt.toISOString(),
  }
}

function minimalGeneratedDocumentTombstone(value: unknown, kind: DocumentKind, deletedAt: Date): JsonObject {
  const candidate = isObject(value) ? value : {}
  return {
    ...(typeof candidate.id === 'string' ? { id: candidate.id } : {}),
    ...(typeof candidate.format === 'string' ? { format: candidate.format } : {}),
    documentKind: kind,
    status: 'excluido_retencao',
    ...(typeof candidate.createdAt === 'string' ? { createdAt: candidate.createdAt } : {}),
    deletedAt: deletedAt.toISOString(),
  }
}

function minimalQuarantineTombstone(value: unknown): JsonObject {
  const candidate = isObject(value) ? value : {}
  return {
    ...(typeof candidate.id === 'string' ? { id: candidate.id } : {}),
    ...(typeof candidate.status === 'string' ? { status: candidate.status } : {}),
    ...(typeof candidate.createdAt === 'string' ? { createdAt: candidate.createdAt } : {}),
    ...(typeof candidate.resolvedAt === 'string' ? { resolvedAt: candidate.resolvedAt } : {}),
    retentionRedacted: true,
  }
}

function minimalParticipantTombstone(value: unknown): JsonObject {
  const candidate = isObject(value) ? value : {}
  return {
    ...(typeof candidate.id === 'string' ? { id: candidate.id } : {}),
    ...(typeof candidate.createdAt === 'string' ? { createdAt: candidate.createdAt } : {}),
    retentionRedacted: true,
  }
}

/**
 * Remove dados clinicos duplicados no snapshot sem destruir a identidade da
 * versao. O outro documento permanece disponivel ate o seu proprio vencimento.
 * Campos de conversa e revisao, por serem fonte comum dos dois documentos, sao
 * descartados no primeiro vencimento documental.
 */
export function redactConsultationVersionSnapshot(
  serialized: string,
  kind: DocumentKind,
  deletedAt: Date
) {
  let snapshot: JsonObject
  try {
    const parsed = JSON.parse(serialized) as unknown
    snapshot = isObject(parsed) ? parsed : {}
  } catch {
    snapshot = {}
  }

  if (Array.isArray(snapshot.documents)) {
    snapshot.documents = snapshot.documents.map((document) => {
      if (!isObject(document) || document.kind !== kind) return document
      return minimalDocumentTombstone(document, kind, deletedAt)
    })
  }
  if (Array.isArray(snapshot.generatedDocuments)) {
    const generatedDocuments = snapshot.generatedDocuments
    snapshot.generatedDocuments = generatedDocuments
      .map((document) => {
        if (!isObject(document) || document.documentKind !== kind) return document
        return minimalGeneratedDocumentTombstone(document, kind, deletedAt)
      })
      .map((document) => isObject(document) ? { ...document, sourceSnapshot: null } : document)
  }
  if (Array.isArray(snapshot.quarantineItems)) {
    snapshot.quarantineItems = snapshot.quarantineItems.map(minimalQuarantineTombstone)
  }
  if (kind === 'compartilhavel' && Array.isArray(snapshot.participants)) {
    snapshot.participants = snapshot.participants.map(minimalParticipantTombstone)
  }

  snapshot.retentionRedactions = [
    ...(Array.isArray(snapshot.retentionRedactions) ? snapshot.retentionRedactions : []),
    { documentKind: kind, deletedAt: deletedAt.toISOString() },
  ]
  return JSON.stringify(snapshot)
}

function resolveSafeAudioPath(candidate: string) {
  const resolved = path.resolve(candidate)
  const relative = path.relative(AUDIO_ROOT, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Caminho de audio fora da area de retencao permitida')
  }
  return resolved
}

export async function enqueuePendingAudioDeletion(input: {
  filePath: string
  userId?: string | null
  consultationId?: string | null
  reason: string
}) {
  // Valida antes de persistir para que a fila jamais seja usada como primitive
  // de exclusao fora do diretorio de audio.
  resolveSafeAudioPath(input.filePath)
  return getPrisma().pendingAudioDeletion.upsert({
    where: { filePath: input.filePath },
    create: {
      filePath: input.filePath,
      userId: input.userId || null,
      consultationId: input.consultationId || null,
      reason: input.reason,
    },
    update: {
      userId: input.userId || null,
      consultationId: input.consultationId || null,
      reason: input.reason,
      lastError: null,
      nextAttemptAt: new Date(),
    },
  })
}

export async function processPendingAudioDeletions(now = new Date()) {
  const prisma = getPrisma()
  const jobs = await prisma.pendingAudioDeletion.findMany({
    where: { nextAttemptAt: { lte: now } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
  let deleted = 0
  for (const job of jobs) {
    const claimed = await prisma.pendingAudioDeletion.updateMany({
      where: { id: job.id, nextAttemptAt: { lte: now } },
      data: { nextAttemptAt: new Date(now.getTime() + 5 * 60 * 1000) },
    })
    if (!claimed.count) continue
    try {
      const safePath = resolveSafeAudioPath(job.filePath)
      if (existsSync(safePath)) {
        const stats = await lstat(safePath)
        if (!stats.isFile() && !stats.isSymbolicLink()) {
          throw new Error('O alvo da fila de audio nao e um arquivo')
        }
        await unlink(safePath)
      }
      const [user, consultation] = await Promise.all([
        job.userId ? prisma.user.findUnique({ where: { id: job.userId }, select: { id: true } }) : null,
        job.consultationId
          ? prisma.consultation.findUnique({ where: { id: job.consultationId }, select: { id: true } })
          : null,
      ])
      await prisma.$transaction(async (tx) => {
        await tx.pendingAudioDeletion.deleteMany({ where: { id: job.id } })
        if (user) {
          await tx.retentionDeletionEvent.create({
            data: {
              userId: user.id,
              consultationId: consultation?.id || null,
              dataClass: job.dataClass,
              targetHash: hashTarget(safePath),
              reason: job.reason,
            },
          })
        }
      })
      deleted += 1
    } catch (error) {
      const attempts = job.attempts + 1
      const retryMinutes = Math.min(24 * 60, 2 ** Math.min(attempts, 10))
      await prisma.pendingAudioDeletion.updateMany({
        where: { id: job.id },
        data: {
          attempts,
          lastError: error instanceof Error ? error.name.slice(0, 120) : 'Erro desconhecido',
          nextAttemptAt: new Date(now.getTime() + retryMinutes * 60 * 1000),
        },
      })
    }
  }
  return deleted
}

async function redactVersionCopies(
  tx: Prisma.TransactionClient,
  consultationId: string,
  kind: DocumentKind,
  now: Date
) {
  const versions = await tx.consultationVersion.findMany({
    where: { consultationId },
    select: { id: true, snapshot: true },
  })
  for (const version of versions) {
    await tx.consultationVersion.update({
      where: { id: version.id },
      data: {
        snapshot: redactConsultationVersionSnapshot(version.snapshot, kind, now),
        transcript: null,
        reason: null,
        editDiff: null,
      },
    })
  }
}

async function expireConsultationDocument(
  document: {
    id: string
    kind: string
    consultationId: string
    consultation: { userId: string | null }
  },
  now: Date
) {
  const userId = document.consultation.userId
  if (!userId || (document.kind !== 'compartilhavel' && document.kind !== 'restrito')) return false
  const kind = document.kind as DocumentKind
  const prisma = getPrisma()

  return prisma.$transaction(async (tx) => {
    const [liveDocument, latestFieldEvent, latestGeneratedDocument] = await Promise.all([
      tx.consultationDocument.findUnique({
        where: { id: document.id },
        include: {
          consultation: {
            select: {
              createdAt: true,
              user: { select: { audioRetentionPolicy: true } },
            },
          },
        },
      }),
      tx.consultationFieldEvent.findFirst({
        where: { consultationId: document.consultationId, documentKind: kind },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      tx.generatedClinicalDocument.findFirst({
        where: { consultationId: document.consultationId, documentKind: kind },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])
    if (!liveDocument) return false
    const policy = liveDocument.consultation.user?.audioRetentionPolicy
    if (policy?.legalHold) {
      await tx.consultationDocument.update({
        where: { id: document.id },
        data: { legalHold: true, deleteAt: null },
      })
      return false
    }
    const minimumYears = kind === 'compartilhavel'
      ? MIN_SHARED_RETENTION_YEARS
      : MIN_RESTRICTED_RETENTION_YEARS
    const configuredYears = kind === 'compartilhavel'
      ? policy?.sharedRecordRetentionYears
      : policy?.restrictedRecordRetentionYears
    const baseTime = Math.max(
      liveDocument.consultation.createdAt.getTime(),
      latestFieldEvent?.createdAt.getTime() || 0,
      latestGeneratedDocument?.createdAt.getTime() || 0
    )
    const minimumDeleteAt = new Date(baseTime + Math.max(minimumYears, configuredYears || minimumYears) * YEAR_MS)
    if (minimumDeleteAt > now) {
      await tx.consultationDocument.update({
        where: { id: document.id },
        data: { deleteAt: minimumDeleteAt },
      })
      return false
    }

    const claimed = await tx.consultationDocument.updateMany({
      where: {
        id: document.id,
        deleteAt: { lte: now },
        legalHold: false,
        deletedAt: null,
      },
      data: {
        contentJson: '{}',
        deletedAt: now,
        status: 'excluido_retencao',
        revision: { increment: 1 },
      },
    })
    if (!claimed.count) return false

    // Mantem autoria, operacao e data da trilha, retirando somente o conteudo.
    await tx.consultationFieldEvent.updateMany({
      where: { consultationId: document.consultationId, documentKind: kind },
      data: {
        previousValueJson: null,
        nextValueJson: null,
        metadataJson: null,
      },
    })
    await tx.consultationFieldValue.deleteMany({ where: { documentId: document.id } })
    await redactVersionCopies(tx, document.consultationId, kind, now)

    // Transcricao, segmentos, quarentena e estado da IA sao fontes comuns dos
    // dois documentos. Guardar uma copia apos qualquer prazo vencer permitiria
    // reconstruir o conteudo ja excluido.
    await tx.consultation.update({
      where: { id: document.consultationId },
      data: { transcript: null, transcriptStructured: null, specialtyData: null },
    })
    await tx.consultationTranscriptSegment.updateMany({
      where: { consultationId: document.consultationId },
      data: { text: '', payload: null },
    })
    await tx.consultationAiState.updateMany({
      where: { consultationId: document.consultationId },
      data: {
        lastProcessedSequence: 0,
        processingThroughSequence: null,
        processingStartedAt: null,
        fieldMetaJson: '{}',
        suggestionsJson: '[]',
        finalReviewAt: null,
      },
    })
    await tx.consultationQuarantineItem.updateMany({
      where: { consultationId: document.consultationId },
      data: {
        kind: 'excluido_retencao',
        reason: RETENTION_REASON,
        sourceText: null,
        payloadJson: null,
      },
    })
    // O snapshot de uma evolucao compartilhavel ainda carregava a conversa
    // inteira. Retira essa copia no primeiro vencimento, sem antecipar o prazo
    // nem apagar o conteudo do documento gerado.
    await tx.generatedClinicalDocument.updateMany({
      where: { consultationId: document.consultationId, deletedAt: null },
      data: { sourceSnapshot: null },
    })

    if (kind === 'compartilhavel') {
      await tx.consultationConsent.updateMany({
        where: { consultationId: document.consultationId },
        data: { evidenceJson: null },
      })
      await tx.medicationReferenceRecord.updateMany({
        where: { consultationId: document.consultationId },
        data: {
          searchedName: '',
          normalizedName: null,
          sourceTitle: null,
          sourceUrl: null,
          contentJson: '{}',
          status: 'excluido_retencao',
        },
      })
      await tx.consultationParticipant.updateMany({
        where: { consultationId: document.consultationId },
        data: {
          name: 'Participante removido por retencao',
          role: 'excluido_retencao',
          speakerLabel: null,
          authorized: false,
          authorizedAt: null,
          active: false,
        },
      })
      await tx.consultationParticipantEvent.updateMany({
        where: { consultationId: document.consultationId },
        data: {
          previousJson: null,
          nextJson: null,
        },
      })
    }

    await tx.retentionDeletionEvent.create({
      data: {
        userId,
        consultationId: document.consultationId,
        dataClass: kind === 'restrito'
          ? 'registro_psicologico_restrito'
          : 'prontuario_compartilhavel',
        targetHash: hashTarget(document.id),
        reason: 'Prazo documental minimo e politica de retencao atingidos',
        metadataJson: JSON.stringify({ documentKind: kind }),
      },
    })
    return true
  })
}

async function expireGeneratedDocument(
  document: {
    id: string
    consultationId: string
    documentKind: string
    consultation: { userId: string | null }
  },
  now: Date
) {
  const userId = document.consultation.userId
  if (!userId) return false
  const prisma = getPrisma()
  return prisma.$transaction(async (tx) => {
    const liveDocument = await tx.generatedClinicalDocument.findUnique({
      where: { id: document.id },
      include: {
        consultation: {
          select: { user: { select: { audioRetentionPolicy: true } } },
        },
      },
    })
    if (!liveDocument) return false
    const policy = liveDocument.consultation.user?.audioRetentionPolicy
    if (policy?.legalHold) {
      await tx.generatedClinicalDocument.update({
        where: { id: document.id },
        data: { legalHold: true, deleteAt: null },
      })
      return false
    }
    const minimumYears = document.documentKind === 'restrito'
      ? MIN_RESTRICTED_RETENTION_YEARS
      : MIN_SHARED_RETENTION_YEARS
    const configuredYears = document.documentKind === 'restrito'
      ? policy?.restrictedRecordRetentionYears
      : policy?.sharedRecordRetentionYears
    const minimumDeleteAt = new Date(
      liveDocument.createdAt.getTime() + Math.max(minimumYears, configuredYears || minimumYears) * YEAR_MS
    )
    if (minimumDeleteAt > now) {
      await tx.generatedClinicalDocument.update({
        where: { id: document.id },
        data: { deleteAt: minimumDeleteAt },
      })
      return false
    }
    const claimed = await tx.generatedClinicalDocument.updateMany({
      where: {
        id: document.id,
        deleteAt: { lte: now },
        legalHold: false,
        deletedAt: null,
      },
      data: {
        contentJson: '{}',
        sourceSnapshot: null,
        amendmentReason: null,
        deletedAt: now,
        status: 'excluido_retencao',
      },
    })
    if (!claimed.count) return false
    await tx.retentionDeletionEvent.create({
      data: {
        userId,
        consultationId: document.consultationId,
        dataClass: `documento_gerado_${document.documentKind}`,
        targetHash: hashTarget(document.id),
        reason: 'Prazo proprio do documento gerado atingido',
        metadataJson: JSON.stringify({ documentKind: document.documentKind }),
      },
    })
    return true
  })
}

export async function runRetentionCycle(now = new Date()) {
  const prisma = getPrisma()
  const expiredAudio = await prisma.consultation.findMany({
    where: { audioPath: { not: null }, audioDeleteAt: { lte: now } },
    select: { id: true },
  })

  for (const candidate of expiredAudio) {
    await prisma.$transaction(async (tx) => {
      const consultation = await tx.consultation.findUnique({
        where: { id: candidate.id },
        select: {
          id: true,
          userId: true,
          audioPath: true,
          audioDeleteAt: true,
          user: { select: { audioRetentionPolicy: { select: { legalHold: true } } } },
        },
      })
      if (!consultation?.userId || !consultation.audioPath ||
        !consultation.audioDeleteAt || consultation.audioDeleteAt > now ||
        consultation.user?.audioRetentionPolicy?.legalHold) return
      resolveSafeAudioPath(consultation.audioPath)
      const claimed = await tx.consultation.updateMany({
        where: {
          id: consultation.id,
          audioPath: consultation.audioPath,
          audioDeleteAt: { lte: now },
        },
        data: { audioPath: null, audioSavedAt: null, audioDeleteAt: null, audioEncrypted: false },
      })
      if (!claimed.count) return
      await tx.pendingAudioDeletion.upsert({
        where: { filePath: consultation.audioPath },
        create: {
          filePath: consultation.audioPath,
          userId: consultation.userId,
          consultationId: consultation.id,
          reason: 'Prazo de retencao configurado atingido',
        },
        update: {
          userId: consultation.userId,
          consultationId: consultation.id,
          reason: 'Prazo de retencao configurado atingido',
          nextAttemptAt: now,
          lastError: null,
        },
      })
    })
  }
  const audioDeleted = await processPendingAudioDeletions(now)

  const expiredDocuments = await prisma.consultationDocument.findMany({
    where: { deleteAt: { lte: now }, legalHold: false, deletedAt: null },
    select: {
      id: true,
      kind: true,
      consultationId: true,
      consultation: { select: { userId: true } },
    },
  })
  let documentsDeleted = 0
  for (const document of expiredDocuments) {
    if (await expireConsultationDocument(document, now)) documentsDeleted += 1
  }

  // Evolucoes e adendos obedecem ao proprio deleteAt. O vencimento do
  // prontuario-base nao encurta nem estende silenciosamente esse prazo.
  const expiredGeneratedDocuments = await prisma.generatedClinicalDocument.findMany({
    where: { deleteAt: { lte: now }, legalHold: false, deletedAt: null },
    select: {
      id: true,
      consultationId: true,
      documentKind: true,
      consultation: { select: { userId: true } },
    },
  })
  let generatedDocumentsDeleted = 0
  for (const document of expiredGeneratedDocuments) {
    if (await expireGeneratedDocument(document, now)) generatedDocumentsDeleted += 1
  }

  return { audioDeleted, documentsDeleted, generatedDocumentsDeleted }
}

export function startRetentionWorker(onError: (error: unknown) => void) {
  const run = () => void runRetentionCycle().catch(onError)
  run()
  const timer = setInterval(run, RETENTION_INTERVAL_MS)
  timer.unref()
  return () => clearInterval(timer)
}
