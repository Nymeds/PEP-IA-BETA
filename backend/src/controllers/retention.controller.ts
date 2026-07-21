import { FastifyReply, FastifyRequest } from 'fastify'
import { getPrisma } from '../lib/prisma'

const MIN_AUDIO_DAYS = 1825
const MIN_SHARED_YEARS = 20
const MIN_RESTRICTED_YEARS = 5

function integerInRange(value: unknown, minimum: number, maximum: number, label: string) {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} deve ficar entre ${minimum} e ${maximum}`)
  }
  return parsed
}

async function ensurePolicy(userId: string) {
  return getPrisma().audioRetentionPolicy.upsert({
    where: { userId },
    update: {},
    create: { userId },
  })
}

export async function getRetentionPolicy(req: FastifyRequest, reply: FastifyReply) {
  const policy = await ensurePolicy(req.authUser!.id)
  return reply.send({
    ...policy,
    minimums: {
      audioRetentionDays: MIN_AUDIO_DAYS,
      sharedRecordRetentionYears: MIN_SHARED_YEARS,
      restrictedRecordRetentionYears: MIN_RESTRICTED_YEARS,
    },
  })
}

export async function updateRetentionPolicy(
  req: FastifyRequest<{
    Body: {
      audioRetentionDays?: number
      sharedRecordRetentionYears?: number
      restrictedRecordRetentionYears?: number
      legalHold?: boolean
    }
  }>,
  reply: FastifyReply
) {
  try {
    const current = await ensurePolicy(req.authUser!.id)
    const audioRetentionDays = integerInRange(
      req.body?.audioRetentionDays,
      MIN_AUDIO_DAYS,
      36500,
      'A retencao de audio em dias'
    ) ?? current.audioRetentionDays
    const sharedRecordRetentionYears = integerInRange(
      req.body?.sharedRecordRetentionYears,
      MIN_SHARED_YEARS,
      100,
      'A retencao do prontuario compartilhavel em anos'
    ) ?? current.sharedRecordRetentionYears
    const restrictedRecordRetentionYears = integerInRange(
      req.body?.restrictedRecordRetentionYears,
      MIN_RESTRICTED_YEARS,
      100,
      'A retencao do registro restrito em anos'
    ) ?? current.restrictedRecordRetentionYears
    const legalHold = req.body?.legalHold ?? current.legalHold

    const prisma = getPrisma()
    const policy = await prisma.audioRetentionPolicy.update({
      where: { userId: req.authUser!.id },
      data: {
        audioRetentionDays,
        sharedRecordRetentionYears,
        restrictedRecordRetentionYears,
        legalHold,
      },
    })
    const consultations = await prisma.consultation.findMany({
      where: { userId: req.authUser!.id },
      select: {
        id: true,
        createdAt: true,
        audioPath: true,
        audioSavedAt: true,
        documents: { select: { id: true, kind: true, deleteAt: true } },
      },
    })
    await prisma.$transaction(async (tx) => {
      for (const consultation of consultations) {
        if (consultation.audioPath) {
          const retentionStart = consultation.audioSavedAt || consultation.createdAt
          await tx.consultation.update({
            where: { id: consultation.id },
            data: {
              audioDeleteAt: legalHold
                ? null
                : new Date(retentionStart.getTime() + audioRetentionDays * 24 * 60 * 60 * 1000),
            },
          })
        }
        for (const document of consultation.documents) {
          const years = document.kind === 'restrito'
            ? restrictedRecordRetentionYears
            : sharedRecordRetentionYears
          const [latestFieldEvent, latestGeneratedDocument] = await Promise.all([
            tx.consultationFieldEvent.findFirst({
              where: { consultationId: consultation.id, documentKind: document.kind },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true },
            }),
            tx.generatedClinicalDocument.findFirst({
              where: { consultationId: consultation.id, documentKind: document.kind },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true },
            }),
          ])
          const baseTime = Math.max(
            consultation.createdAt.getTime(),
            latestFieldEvent?.createdAt.getTime() || 0,
            latestGeneratedDocument?.createdAt.getTime() || 0
          )
          const calculatedDeleteAt = new Date(baseTime + years * 365.25 * 24 * 60 * 60 * 1000)
          const deleteAt = legalHold
            ? null
            : document.deleteAt && document.deleteAt > calculatedDeleteAt
              ? document.deleteAt
              : calculatedDeleteAt
          await tx.consultationDocument.update({
            where: { id: document.id },
            data: { deleteAt, legalHold },
          })
          const generatedDocuments = await tx.generatedClinicalDocument.findMany({
            where: { consultationId: consultation.id, documentKind: document.kind },
            select: { id: true, createdAt: true, deleteAt: true },
          })
          for (const generated of generatedDocuments) {
            const calculatedGeneratedDeleteAt = new Date(
              generated.createdAt.getTime() + years * 365.25 * 24 * 60 * 60 * 1000
            )
            await tx.generatedClinicalDocument.update({
              where: { id: generated.id },
              data: {
                deleteAt: legalHold
                  ? null
                  : generated.deleteAt && generated.deleteAt > calculatedGeneratedDeleteAt
                    ? generated.deleteAt
                    : calculatedGeneratedDeleteAt,
                legalHold,
              },
            })
          }
        }
      }
    })
    return reply.send({
      ...policy,
      minimums: {
        audioRetentionDays: MIN_AUDIO_DAYS,
        sharedRecordRetentionYears: MIN_SHARED_YEARS,
        restrictedRecordRetentionYears: MIN_RESTRICTED_YEARS,
      },
    })
  } catch (error) {
    return reply.status(400).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel atualizar a retencao',
    })
  }
}
