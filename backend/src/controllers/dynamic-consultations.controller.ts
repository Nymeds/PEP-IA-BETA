import { FastifyReply, FastifyRequest } from 'fastify'
import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { getPrisma } from '../lib/prisma'
import { CONSULTATION_STATUS, normalizeConsultationStatus } from '../lib/schedule'
import {
  ClinicalFormDefinition,
  FormRuntimeManifest,
  buildRuntimeManifest,
  parseFormDefinition,
} from '../services/clinical-forms.service'
import {
  DynamicFieldUpdate,
  DynamicTranscriptSegment,
  GeneratedDocumentFormat,
  extractDynamicFormDelta,
  generateDynamicClinicalDocument,
  suggestDynamicConversationTopics,
  validateDynamicFieldValue,
} from '../services/dynamic-clinical-ai.service'
import { findMedicationReference } from '../services/medication-reference.service'
import { DialogueTurn, diarizeAudio } from '../services/review.service'
import { protectSensitiveText, revealSensitiveText } from '../services/sensitive-data.service'
import { recordSensitiveAccess } from '../services/access-audit.service'

const CONSENT_TERMS_VERSION = 'psychology-ai-consent-v1'
const DYNAMIC_AI_PROCESSING_LEASE_MS = 60_000
const PARTICIPANT_ROLES = new Set([
  'profissional',
  'paciente',
  'responsavel',
  'familiar',
  'acompanhante',
  'interprete',
  'outro',
])

function dynamicFormsEnabled() {
  return process.env.DYNAMIC_FORMS_PSYCHOLOGY !== 'false'
}

class RevisionConflictError extends Error {}
class FormVersionConflictError extends Error {}
class DocumentConfirmationConflictError extends Error {}

class ConsentRequiredError extends Error {
  statusCode = 409
  code = 'DYNAMIC_CONSENT_REQUIRED'
}

class FinalizationBlockedError extends Error {
  statusCode = 409
  code = 'DYNAMIC_REVIEW_REQUIRED'
}

class RetentionExpiredError extends Error {
  statusCode = 410
  code = 'DOCUMENT_RETENTION_EXPIRED'
}

const BLOCKING_QUARANTINE_KINDS = new Set([
  'alerta_risco',
  'sugestao_ia',
  'conflito',
  'falante_nao_autorizado',
  'possivel_alucinacao',
  'sem_evidencia',
  'remapeamento_vozes',
  'consentimento_revogado',
])

function expectedEvolutionSections(format: string) {
  if (format === 'SOAP') return ['subjetivo', 'objetivo', 'avaliacao', 'plano']
  if (format === 'DAP') return ['dados', 'avaliacao', 'plano']
  if (format === 'BIRP') return ['comportamento', 'intervencao', 'resposta', 'plano']
  return []
}

function hasCompleteEvolutionContent(format: string, content: Record<string, unknown>) {
  const sections = Array.isArray(content.sections) ? content.sections : []
  const sectionMap = new Map(sections.flatMap((section) => {
    if (!section || typeof section !== 'object' || Array.isArray(section)) return []
    const candidate = section as { key?: unknown; content?: unknown }
    return typeof candidate.key === 'string' && typeof candidate.content === 'string'
      ? [[candidate.key, candidate.content.trim()] as const]
      : []
  }))
  const expected = expectedEvolutionSections(format)
  return expected.length > 0 && expected.every((key) => Boolean(sectionMap.get(key)))
}

export async function assertDynamicFinalizationReady(consultationId: string, userId: string) {
  const consultation = await findOwnedConsultation(consultationId, userId)
  if (!consultation || consultation.formMode !== 'dynamic') return
  const blockers = consultation.quarantineItems.filter(
    (item) => item.status === 'pendente' && BLOCKING_QUARANTINE_KINDS.has(item.kind)
  )
  if (blockers.length) {
    throw new FinalizationBlockedError(
      `Revise ${blockers.length} item(ns) critico(s) da central antes de finalizar`
    )
  }
}

const GENERATED_DOCUMENT_SECTIONS: Record<string, string[]> = {
  SOAP: ['subjetivo', 'objetivo', 'avaliacao', 'plano'],
  DAP: ['dados', 'avaliacao', 'plano'],
  BIRP: ['comportamento', 'intervencao', 'resposta', 'plano'],
}

function validateGeneratedDocumentContent(content: Record<string, unknown>, format: string) {
  const serialized = JSON.stringify(content)
  if (serialized.length > 200_000) return 'O documento excede o limite permitido'
  const sections = content.sections
  if (!Array.isArray(sections)) return 'O documento precisa conter suas secoes estruturadas'
  const expected = GENERATED_DOCUMENT_SECTIONS[format]
  if (!expected) return 'Formato de evolucao invalido'
  if (sections.length !== expected.length) return 'O documento precisa conter exatamente as secoes do formato escolhido'
  const received = new Set<string>()
  for (const section of sections) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      return 'Existe uma secao invalida no documento'
    }
    const item = section as Record<string, unknown>
    if (typeof item.key !== 'string' || !expected.includes(item.key)) {
      return 'Existe uma secao desconhecida no documento'
    }
    if (typeof item.content !== 'string' || !item.content.trim() || item.content.length > 50_000) {
      return `Revise o conteudo da secao ${item.key}`
    }
    if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200) {
      return `Revise o titulo da secao ${item.key}`
    }
    if (!Array.isArray(item.evidenceSegmentIds) || item.evidenceSegmentIds.length > 500 ||
      !item.evidenceSegmentIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 200)) {
      return `Revise as evidencias da secao ${item.key}`
    }
    received.add(item.key)
  }
  if (expected.some((key) => !received.has(key)) || received.size !== expected.length) {
    return 'O documento nao contem todas as secoes obrigatorias'
  }
  if (content.warnings !== undefined &&
    (!Array.isArray(content.warnings) || content.warnings.length > 100 ||
      !content.warnings.every((warning) => typeof warning === 'string' && warning.length <= 2_000))) {
    return 'Revise os avisos do documento'
  }
  return null
}

function validateGeneratedDocumentEvidence(
  content: Record<string, unknown>,
  allowedSegmentIds: ReadonlySet<string>,
  requireEvidence = false
) {
  const sections = Array.isArray(content.sections) ? content.sections : []
  for (const section of sections) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue
    const item = section as Record<string, unknown>
    const evidenceIds = Array.isArray(item.evidenceSegmentIds) ? item.evidenceSegmentIds : []
    if (requireEvidence && evidenceIds.length === 0) {
      return `A secao ${String(item.key || '')} nao possui evidencia clinica validada`
    }
    for (const evidenceId of evidenceIds) {
      if (typeof evidenceId !== 'string' || !allowedSegmentIds.has(evidenceId)) {
        return 'O documento referencia uma evidencia ausente ou nao autorizada'
      }
    }
    if (requireEvidence) {
      const evidence = Array.isArray(item.evidence) ? item.evidence : []
      if (!evidence.length) return `A secao ${String(item.key || '')} nao possui citacao literal validada`
      for (const candidate of evidence) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
          return 'O documento contem uma citacao clinica invalida'
        }
        const value = candidate as Record<string, unknown>
        if (typeof value.segmentId !== 'string' || !evidenceIds.includes(value.segmentId) ||
          typeof value.quote !== 'string' || !value.quote.trim()) {
          return 'O documento contem uma citacao sem vinculo com a evidencia declarada'
        }
      }
    }
  }
  return null
}

function generatedEvidenceFingerprint(content: Record<string, unknown>) {
  const sections = Array.isArray(content.sections) ? content.sections : []
  return createHash('sha256').update(JSON.stringify(sections.map((section) => {
    if (!section || typeof section !== 'object' || Array.isArray(section)) return null
    const item = section as Record<string, unknown>
    return {
      key: item.key,
      evidenceSegmentIds: item.evidenceSegmentIds,
      evidence: item.evidence,
    }
  }))).digest('hex')
}

function sourceSnapshotSegmentIds(
  sourceSnapshot: string | null,
  documentKind: string
) {
  if (!sourceSnapshot) return new Set<string>()
  const serialized = documentKind === 'restrito'
    ? revealSensitiveText(sourceSnapshot)
    : sourceSnapshot
  const snapshot = parseJson<{ transcriptSegments?: Array<{ id?: unknown }> }>(serialized, {})
  return new Set(
    (snapshot.transcriptSegments || [])
      .map((segment) => segment.id)
      .filter((id): id is string => typeof id === 'string' && Boolean(id))
  )
}

function withoutSourceSnapshot<T extends { sourceSnapshot: string | null }>(document: T) {
  const { sourceSnapshot: _sourceSnapshot, ...safeDocument } = document
  void _sourceSnapshot
  return safeDocument
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function unprotectJson(value: string, documentKind: string) {
  const revealed = documentKind === 'restrito' ? revealSensitiveText(value) : value
  return parseJson<unknown>(revealed, null)
}

function protectJson(value: unknown, documentKind: string) {
  const serialized = JSON.stringify(value)
  return documentKind === 'restrito' ? protectSensitiveText(serialized) : serialized
}

function documentWasDeleted(
  consultation: { documents: Array<{ kind: string; deletedAt: Date | null }> },
  kind?: 'compartilhavel' | 'restrito'
) {
  return consultation.documents.some((document) =>
    Boolean(document.deletedAt) && (!kind || document.kind === kind)
  )
}

function assertDocumentAvailable(
  consultation: { documents: Array<{ kind: string; deletedAt: Date | null }> },
  kind?: 'compartilhavel' | 'restrito'
) {
  if (documentWasDeleted(consultation, kind)) {
    throw new RetentionExpiredError(
      kind
        ? `O documento ${kind} foi excluido pela politica de retencao e nao pode ser recriado`
        : 'A consulta possui documento excluido pela politica de retencao e nao aceita regravacao'
    )
  }
}

async function findOwnedConsultation(id: string, userId: string) {
  return getPrisma().consultation.findFirst({
    where: { id, userId },
    include: {
      patient: true,
      user: true,
      schedule: true,
      aiState: true,
      formTemplateVersion: {
        include: {
          template: {
            include: {
              versions: { orderBy: { version: 'desc' }, take: 1 },
            },
          },
        },
      },
      documents: { include: { fieldValues: true } },
      fieldEvents: { orderBy: { createdAt: 'desc' }, take: 1000 },
      participants: { orderBy: { createdAt: 'asc' } },
      consents: { orderBy: { recordedAt: 'desc' } },
      quarantineItems: { orderBy: { createdAt: 'desc' } },
      generatedDocuments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
      medicationReferences: { orderBy: { consultedAt: 'desc' } },
      transcriptSegments: { orderBy: { sequence: 'asc' } },
    },
  })
}

function definitionForConsultation(consultation: Awaited<ReturnType<typeof findOwnedConsultation>>) {
  if (!consultation?.formTemplateVersionId || !consultation.formTemplateVersion) {
    throw new Error('Consulta nao possui formulario dinamico pinado')
  }
  return parseFormDefinition(
    consultation.formDefinitionSnapshot || consultation.formTemplateVersion.definitionJson
  )
}

function manifestForConsultation(
  consultation: NonNullable<Awaited<ReturnType<typeof findOwnedConsultation>>>,
  definition: ClinicalFormDefinition
) {
  return parseJson<FormRuntimeManifest>(
    consultation.formTemplateVersion?.runtimeManifestJson,
    buildRuntimeManifest(definition)
  )
}

function manifestFieldMap(manifest: FormRuntimeManifest) {
  return new Map(manifest.documents.flatMap((document) =>
    document.fields.map((field) => [field.id, { field, documentKind: document.kind }] as const)
  ))
}

async function ensureDynamicDocuments(
  consultationId: string,
  definition: ClinicalFormDefinition
) {
  const prisma = getPrisma()
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    select: {
      createdAt: true,
      user: { select: { audioRetentionPolicy: true } },
    },
  })
  if (!consultation) throw new Error('Consulta nao encontrada para criar os documentos')
  const policy = consultation.user?.audioRetentionPolicy
  for (const document of definition.documents) {
    const minimumYears = document.kind === 'compartilhavel' ? 20 : 5
    const configuredYears = document.kind === 'compartilhavel'
      ? policy?.sharedRecordRetentionYears
      : policy?.restrictedRecordRetentionYears
    const retentionYears = Math.max(minimumYears, configuredYears || minimumYears)
    const deleteAt = policy?.legalHold
      ? null
      : new Date(consultation.createdAt.getTime() + retentionYears * 365.25 * 24 * 60 * 60 * 1000)
    await prisma.consultationDocument.upsert({
      where: { consultationId_kind: { consultationId, kind: document.kind } },
      create: {
        consultationId,
        kind: document.kind,
        title: document.label,
        deleteAt,
        legalHold: Boolean(policy?.legalHold),
      },
      update: { title: document.label },
    })
  }
}

async function ensureCoreParticipants(
  consultation: NonNullable<Awaited<ReturnType<typeof findOwnedConsultation>>>
) {
  // Nunca repoe nomes/vozes depois que o prontuario compartilhavel foi
  // anonimizado pelo ciclo de retencao.
  if (documentWasDeleted(consultation, 'compartilhavel')) return
  const prisma = getPrisma()
  const cores = [
    {
      coreKey: 'profissional',
      role: 'profissional',
      name: consultation.user?.suggestedName || consultation.user?.name || 'Profissional',
      authorized: true,
    },
    {
      coreKey: 'paciente',
      role: 'paciente',
      name: consultation.patient.name,
      authorized: false,
    },
  ] as const

  for (const core of cores) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(async (tx) => {
          const existing = await tx.consultationParticipant.findFirst({
            where: { consultationId: consultation.id, role: core.role },
            orderBy: { createdAt: 'asc' },
          })
          if (existing) {
            if (!existing.coreKey) {
              await tx.consultationParticipant.update({
                where: { id: existing.id },
                data: { coreKey: core.coreKey },
              })
            }
            return
          }
          await tx.consultationParticipant.upsert({
            where: {
              consultationId_coreKey: {
                consultationId: consultation.id,
                coreKey: core.coreKey,
              },
            },
            create: {
              consultationId: consultation.id,
              coreKey: core.coreKey,
              name: core.name,
              role: core.role,
              authorized: core.authorized,
              authorizedAt: core.authorized ? new Date() : null,
            },
            update: {},
          })
        })
        break
      } catch (error) {
        const code = (error as { code?: string })?.code
        if ((code === 'P2002' || code === 'P2034') && attempt < 2) continue
        throw error
      }
    }
  }
}

async function currentValues(
  consultation: NonNullable<Awaited<ReturnType<typeof findOwnedConsultation>>>,
  manifest?: FormRuntimeManifest
) {
  const values: Record<string, unknown> = {}
  const allowedByDocument = new Map<string, Set<string>>(
    (manifest?.documents || []).map((document) => [
      document.kind,
      new Set(document.fields.map((field) => field.id)),
    ])
  )
  for (const document of consultation.documents) {
    if (document.deletedAt) continue
    for (const field of document.fieldValues) {
      const allowed = allowedByDocument.get(document.kind)
      if (manifest && !allowed?.has(field.fieldId)) continue
      values[field.fieldId] = unprotectJson(field.valueJson, document.kind)
    }
  }
  return values
}

async function documentSourceSnapshot(
  consultation: NonNullable<Awaited<ReturnType<typeof findOwnedConsultation>>>,
  manifest: FormRuntimeManifest,
  documentKind: 'compartilhavel' | 'restrito',
  segments: DynamicTranscriptSegment[],
  createdManually = false
) {
  const allowedFieldIds = new Set(
    manifest.documents.find((item) => item.kind === documentKind)?.fields.map((field) => field.id) || []
  )
  return {
    formTemplateVersionId: consultation.formTemplateVersionId,
    documentKind,
    createdManually,
    values: Object.fromEntries(
      Object.entries(await currentValues(consultation, manifest))
        .filter(([fieldId]) => allowedFieldIds.has(fieldId))
    ),
    transcriptSegments: segments.map((segment) => ({
      id: segment.id,
      sequence: segment.sequence,
      speakerLabel: segment.speakerLabel,
      participantId: segment.participantId,
      participantRole: segment.participantRole,
      ...(documentKind === 'restrito'
        ? { text: segment.text }
        : { textHash: createHash('sha256').update(segment.text).digest('hex') }),
      startMs: segment.startMs,
      endMs: segment.endMs,
    })),
    participants: consultation.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      role: participant.role,
      speakerLabel: participant.speakerLabel,
      authorized: participant.authorized,
    })),
  }
}

function runtimePayload(
  consultation: NonNullable<Awaited<ReturnType<typeof findOwnedConsultation>>>,
  definition: ClinicalFormDefinition,
  manifest: FormRuntimeManifest
) {
  const allowedByDocument = new Map<string, Set<string>>(
    manifest.documents.map((document) => [
      document.kind,
      new Set(document.fields.map((field) => field.id)),
    ])
  )
  const documents = consultation.documents.filter((document) => !document.deletedAt).map((document) => ({
    id: document.id,
    kind: document.kind,
    title: document.title,
    status: document.status,
    revision: document.revision,
    values: Object.fromEntries(document.fieldValues
      .filter((field) => allowedByDocument.get(document.kind)?.has(field.fieldId))
      .map((field) => [
      field.fieldId,
      (() => {
        const history = consultation.fieldEvents
          .filter((event) => event.documentKind === document.kind && event.fieldId === field.fieldId)
          .map((event) => ({
            id: event.id,
            operation: event.operation,
            actorType: event.actorType,
            actorUserId: event.actorUserId,
            previousValue: event.previousValueJson
              ? unprotectJson(event.previousValueJson, document.kind)
              : null,
            nextValue: event.nextValueJson
              ? unprotectJson(event.nextValueJson, document.kind)
              : null,
            metadata: event.metadataJson
              ? unprotectJson(event.metadataJson, document.kind)
              : null,
            createdAt: event.createdAt,
          }))
        const latestAiMetadata = history.find((event) => event.actorType === 'ia')?.metadata as
          | { confidence?: string; uncertainty?: string | null }
          | null
          | undefined
        return {
        value: unprotectJson(field.valueJson, document.kind),
        source: field.source,
        reviewStatus: field.reviewStatus,
        evidence: field.evidenceJson
          ? unprotectJson(field.evidenceJson, document.kind)
          : [],
        revision: field.revision,
        updatedAt: field.updatedAt,
        confidence: latestAiMetadata?.confidence || null,
        uncertainty: latestAiMetadata?.uncertainty || null,
        history,
        }
      })(),
      ])),
  }))

  return {
    formMode: 'dynamic' as const,
    consultationId: consultation.id,
    specialtyCode: consultation.specialtyCode,
    template: {
      id: consultation.formTemplateVersion?.template.id,
      name: consultation.formTemplateVersion?.template.name,
      versionId: consultation.formTemplateVersion?.id,
      version: consultation.formTemplateVersion?.version,
      checksum: consultation.formTemplateVersion?.checksum,
      defaultDocumentFormat: definition.defaultDocumentFormat,
      latestVersionId: consultation.formTemplateVersion?.template.versions[0]?.id || null,
      latestVersion: consultation.formTemplateVersion?.template.versions[0]?.version || null,
      newVersionAvailable: Boolean(
        consultation.formTemplateVersion?.template.versions[0] &&
        consultation.formTemplateVersion.template.versions[0].version > consultation.formTemplateVersion.version
      ),
    },
    definition,
    manifest,
    documents,
    participants: consultation.participants,
    consents: consultation.consents.map((consent) => {
      const evidenceJson = consent.evidenceJson
        ? revealSensitiveText(consent.evidenceJson)
        : null
      return {
        ...consent,
        evidenceJson,
        evidence: parseJson<Record<string, unknown> | null>(evidenceJson, null),
      }
    }),
    quarantine: consultation.quarantineItems.map((item) => ({
      ...item,
      sourceText: item.sourceText ? revealSensitiveText(item.sourceText) : null,
      payloadJson: item.payloadJson ? revealSensitiveText(item.payloadJson) : null,
    })),
    generatedDocuments: consultation.generatedDocuments.filter((document) => !document.deletedAt).map((document) => ({
      id: document.id,
      consultationId: document.consultationId,
      format: document.format,
      documentKind: document.documentKind,
      status: document.status,
      source: document.source,
      createdBy: document.createdBy,
      parentDocumentId: document.parentDocumentId,
      amendmentReason: document.amendmentReason,
      reviewedAt: document.reviewedAt,
      reviewedBy: document.reviewedBy,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      contentJson: document.documentKind === 'restrito'
        ? revealSensitiveText(document.contentJson)
        : document.contentJson,
    })),
    medicationReferences: consultation.medicationReferences
      .filter((reference) => reference.status !== 'excluido_retencao')
      .map((reference) => ({
      ...reference,
      content: parseJson(reference.contentJson, {}),
      contentJson: undefined,
      })),
    conversation: {
      transcript: consultation.transcript,
      turns: parseJson<DialogueTurn[]>(consultation.transcriptStructured, []),
      segments: transcriptSegmentsFromStored(consultation, consultation.transcriptSegments),
    },
    canChangeForm: normalizeConsultationStatus(consultation.status) === CONSULTATION_STATUS.WAITING,
    suppressFormChangeWarning: consultation.user?.suppressFormChangeWarning || false,
  }
}

export async function getDynamicRuntime(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (consultation.formMode !== 'dynamic' || !consultation.formTemplateVersionId) {
    return reply.send({ formMode: 'legacy', consultationId: consultation.id })
  }
  if (!dynamicFormsEnabled()) {
    return reply.status(503).send({ error: 'Formularios dinamicos estao desabilitados' })
  }

  const definition = definitionForConsultation(consultation)
  await ensureDynamicDocuments(consultation.id, definition)
  await ensureCoreParticipants(consultation)
  const refreshed = await findOwnedConsultation(consultation.id, req.authUser!.id)
  if (!refreshed) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  await Promise.all([
    recordSensitiveAccess({
      actorUserId: req.authUser!.id,
      consultationId: refreshed.id,
      dataClass: 'prontuario_compartilhavel',
      action: 'visualizar_runtime',
      requestId: req.id,
    }),
    recordSensitiveAccess({
      actorUserId: req.authUser!.id,
      consultationId: refreshed.id,
      dataClass: 'registro_psicologico_restrito',
      action: 'visualizar_runtime',
      requestId: req.id,
    }),
  ])
  return reply.send(runtimePayload(refreshed, definition, manifestForConsultation(refreshed, definition)))
}

interface ManualFieldChange {
  fieldId: string
  value: unknown
  expectedRevision?: number
}

async function applyManualChanges(input: {
  consultation: NonNullable<Awaited<ReturnType<typeof findOwnedConsultation>>>
  documentKind: 'compartilhavel' | 'restrito'
  changes: ManualFieldChange[]
  actorUserId: string
  reason?: string
}) {
  const definition = definitionForConsultation(input.consultation)
  const manifest = manifestForConsultation(input.consultation, definition)
  const fields = manifestFieldMap(manifest)
  const document = input.consultation.documents.find((item) => item.kind === input.documentKind)
  if (!document) throw new Error('Documento dinamico nao encontrado')
  assertDocumentAvailable(input.consultation, input.documentKind)

  const isFinished = normalizeConsultationStatus(input.consultation.status) === CONSULTATION_STATUS.FINISHED
  if (isFinished && !input.reason?.trim()) {
    throw new Error('Informe o motivo do adendo para alterar uma consulta finalizada')
  }

  const prisma = getPrisma()
  try {
    await prisma.$transaction(async (tx) => {
      for (const change of input.changes) {
        const entry = fields.get(change.fieldId)
        if (!entry || entry.documentKind !== input.documentKind) {
          throw new Error(`Campo ${change.fieldId} nao pertence ao documento informado`)
        }
        const isExplicitClear = change.value === null ||
          (typeof change.value === 'string' && !change.value.trim())
        if ((isExplicitClear && entry.field.required) ||
          (!isExplicitClear && !validateDynamicFieldValue(entry.field, change.value))) {
          throw new Error(`Valor invalido para o campo ${entry.field.label}`)
        }

        const existing = await tx.consultationFieldValue.findUnique({
          where: { documentId_fieldId: { documentId: document.id, fieldId: change.fieldId } },
        })
        if (
          change.expectedRevision != null &&
          (existing?.revision || 0) !== change.expectedRevision
        ) {
          throw new RevisionConflictError(`O campo ${entry.field.label} foi alterado em outra sessao`)
        }

        const nextValueJson = protectJson(change.value, input.documentKind)
        let saved
        if (existing) {
          const updated = await tx.consultationFieldValue.updateMany({
            where: { id: existing.id, revision: existing.revision },
            data: {
              valueJson: nextValueJson,
              source: 'manual',
              reviewStatus: 'confirmado',
              evidenceJson: null,
              revision: { increment: 1 },
            },
          })
          if (updated.count !== 1) {
            throw new RevisionConflictError(`O campo ${entry.field.label} foi alterado em outra sessao`)
          }
          saved = await tx.consultationFieldValue.findUniqueOrThrow({
            where: { id: existing.id },
          })
        } else {
          saved = await tx.consultationFieldValue.create({
            data: {
              consultationId: input.consultation.id,
              documentId: document.id,
              fieldId: change.fieldId,
              valueJson: nextValueJson,
              source: 'manual',
              reviewStatus: 'confirmado',
              revision: 1,
            },
          })
        }
        await tx.consultationFieldEvent.create({
          data: {
            consultationId: input.consultation.id,
            fieldValueId: saved.id,
            documentKind: input.documentKind,
            fieldId: change.fieldId,
            operation: isFinished ? 'adendo' : isExplicitClear ? 'limpar' : existing ? 'editar' : 'criar',
            previousValueJson: existing?.valueJson || null,
            nextValueJson,
            actorType: 'profissional',
            actorUserId: input.actorUserId,
            metadataJson: protectJson(
              { reason: input.reason?.trim() || null },
              input.documentKind
            ),
          },
        })
      }
      await tx.consultationDocument.update({
        where: { id: document.id },
        data: { revision: { increment: 1 } },
      })
    })
  } catch (error) {
    if (error instanceof RevisionConflictError) throw error
    const code = (error as { code?: string })?.code
    if (code === 'P2002' || code === 'P2034') {
      throw new RevisionConflictError('O formulario foi alterado em outra sessao')
    }
    throw error
  }
}

export async function updateDynamicFields(
  req: FastifyRequest<{
    Params: { id: string }
    Body: {
      documentKind?: 'compartilhavel' | 'restrito'
      changes?: ManualFieldChange[]
      reason?: string
    }
  }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (consultation.formMode !== 'dynamic') {
    return reply.status(409).send({ error: 'Consulta utiliza o prontuario legado' })
  }
  const documentKind = req.body?.documentKind
  const changes = req.body?.changes
  if (!documentKind || !Array.isArray(changes) || !changes.length) {
    return reply.status(400).send({ error: 'Informe o documento e ao menos uma alteracao' })
  }
  if (changes.length > 200) {
    return reply.status(400).send({ error: 'Envie no maximo 200 alteracoes por requisicao' })
  }
  if (new Set(changes.map((change) => change.fieldId)).size !== changes.length) {
    return reply.status(400).send({ error: 'Cada campo pode aparecer apenas uma vez por requisicao' })
  }
  if (req.body?.reason && req.body.reason.length > 2_000) {
    return reply.status(400).send({ error: 'O motivo da alteracao excede o limite permitido' })
  }

  try {
    await applyManualChanges({
      consultation,
      documentKind,
      changes,
      actorUserId: req.authUser!.id,
      reason: req.body?.reason,
    })
    const refreshed = await findOwnedConsultation(consultation.id, req.authUser!.id)
    if (!refreshed) return reply.status(404).send({ error: 'Consulta nao encontrada' })
    const definition = definitionForConsultation(refreshed)
    return reply.send(runtimePayload(refreshed, definition, manifestForConsultation(refreshed, definition)))
  } catch (error) {
    const status = error instanceof RevisionConflictError
      ? 409
      : error instanceof RetentionExpiredError
        ? error.statusCode
        : 400
    return reply.status(status).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel salvar os campos',
    })
  }
}

export async function changeDynamicFormVersion(
  req: FastifyRequest<{
    Params: { id: string }
    Body: { versionId?: string; suppressWarning?: boolean; preview?: boolean }
  }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (consultation.formMode !== 'dynamic') {
    return reply.status(409).send({ error: 'Consultas legadas nao podem ser convertidas por esta operacao' })
  }
  if (normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.WAITING) {
    return reply.status(409).send({ error: 'O formulario so pode ser alterado antes do inicio da consulta' })
  }
  const versionId = req.body?.versionId?.trim()
  if (!versionId) return reply.status(400).send({ error: 'Informe a versao do formulario' })

  const version = await getPrisma().clinicalFormTemplateVersion.findFirst({
    where: { id: versionId, template: { userId: req.authUser!.id, archivedAt: null } },
    include: { template: true },
  })
  if (!version) return reply.status(404).send({ error: 'Versao de formulario nao encontrada' })
  if (consultation.specialtyCode && version.template.specialtyCode !== consultation.specialtyCode) {
    return reply.status(400).send({ error: 'O formulario nao pertence a especialidade da consulta' })
  }

  if (consultation.formTemplateVersionId === version.id) {
    if (req.body?.suppressWarning != null) {
      await getPrisma().user.update({
        where: { id: req.authUser!.id },
        data: { suppressFormChangeWarning: req.body.suppressWarning },
      })
    }
    return reply.send({
      changed: false,
      versionId: version.id,
      version: version.version,
      orphanedFieldIds: [],
      addedFieldIds: [],
      message: 'A consulta ja utiliza esta versao do formulario.',
    })
  }

  const nextDefinition = parseFormDefinition(version.definitionJson)
  const previousDefinition = consultation.formTemplateVersionId
    ? definitionForConsultation(consultation)
    : null
  const previousFields = new Map(previousDefinition
    ? buildRuntimeManifest(previousDefinition).documents.flatMap((document) =>
        document.fields.map((field) => [field.id, { documentKind: document.kind, type: field.type }] as const)
      )
    : [])
  const nextFields = new Map(buildRuntimeManifest(nextDefinition).documents.flatMap((document) =>
    document.fields.map((field) => [field.id, { documentKind: document.kind, type: field.type }] as const)
  ))
  const incompatibleFields: Array<{
    fieldId: string
    reason: 'campo_removido' | 'documento_alterado' | 'tipo_alterado'
    previous: { documentKind: string; type: string }
    next: { documentKind: string; type: string } | null
  }> = []
  for (const [fieldId, previous] of previousFields.entries()) {
    const next = nextFields.get(fieldId)
    if (!next) {
      incompatibleFields.push({ fieldId, reason: 'campo_removido', previous, next: null })
      continue
    }
    if (next.documentKind !== previous.documentKind) {
      incompatibleFields.push({ fieldId, reason: 'documento_alterado', previous, next })
      continue
    }
    if (next.type !== previous.type) {
      incompatibleFields.push({ fieldId, reason: 'tipo_alterado', previous, next })
    }
  }
  const orphanedFieldIds = incompatibleFields.map((item) => item.fieldId)
  const addedFieldIds = Array.from(nextFields.keys()).filter((fieldId) => !previousFields.has(fieldId))

  if (req.body?.preview) {
    return reply.send({
      preview: true,
      current: consultation.formTemplateVersion
        ? {
            id: consultation.formTemplateVersion.id,
            version: consultation.formTemplateVersion.version,
            name: consultation.formTemplateVersion.template.name,
          }
        : null,
      next: { id: version.id, version: version.version, name: version.template.name },
      orphanedFieldIds,
      addedFieldIds,
      incompatibleFields,
      manualValuesPreserved: true,
      confirmationSuppressed: consultation.user?.suppressFormChangeWarning || false,
    })
  }

  try {
    await getPrisma().$transaction(async (tx) => {
      const claimed = await tx.consultation.updateMany({
        where: {
          id: consultation.id,
          userId: req.authUser!.id,
          status: consultation.status,
          formTemplateVersionId: consultation.formTemplateVersionId,
        },
        data: {
          formMode: 'dynamic',
          specialtyCode: version.template.specialtyCode,
          formTemplateVersionId: version.id,
          formDefinitionSnapshot: version.definitionJson,
          formPinnedAt: new Date(),
        },
      })
      if (claimed.count !== 1) {
        throw new FormVersionConflictError('A consulta foi iniciada ou alterada em outra sessao')
      }
      await tx.consultationVersion.create({
      data: {
        consultationId: consultation.id,
        version: (await tx.consultationVersion.count({ where: { consultationId: consultation.id } })) + 1,
        snapshot: JSON.stringify({
          formTemplateVersionId: consultation.formTemplateVersionId,
          formDefinitionSnapshot: consultation.formDefinitionSnapshot,
          documents: consultation.documents,
        }),
        transcript: consultation.transcript,
        reason: 'Troca de formulario antes do inicio',
      },
      })
      await tx.consultationAppointmentEvent.create({
      data: {
        consultationId: consultation.id,
        operation: 'troca_formulario',
        previousScheduledAt: consultation.scheduledAt,
        scheduledAt: consultation.scheduledAt,
        previousStatus: consultation.status,
        status: consultation.status,
        reason: JSON.stringify({
          previousVersionId: consultation.formTemplateVersionId,
          nextVersionId: version.id,
          orphanedFieldIds,
        }),
      },
      })
      if (req.body?.suppressWarning != null) {
        await tx.user.update({
        where: { id: req.authUser!.id },
        data: { suppressFormChangeWarning: req.body.suppressWarning },
        })
      }
    })
  } catch (error) {
    if (error instanceof FormVersionConflictError) {
      return reply.status(409).send({ error: error.message })
    }
    throw error
  }

  await ensureDynamicDocuments(consultation.id, nextDefinition)
  return reply.send({
    changed: true,
    versionId: version.id,
    version: version.version,
    orphanedFieldIds,
    addedFieldIds,
    incompatibleFields,
    message: orphanedFieldIds.length
      ? 'Formulario alterado; valores sem correspondencia foram preservados no historico.'
      : 'Formulario alterado com sucesso.',
  })
}

function participantAuditSnapshot(participant: {
  name: string
  role: string
  speakerLabel: string | null
  active: boolean
  authorized: boolean
  authorizedAt: Date | null
}) {
  return {
    name: participant.name,
    role: participant.role,
    speakerLabel: participant.speakerLabel,
    active: participant.active,
    authorized: participant.authorized,
    authorizedAt: participant.authorizedAt,
  }
}

async function invalidateAiAfterSpeakerRemap(
  tx: Prisma.TransactionClient,
  consultationId: string,
  actorUserId: string,
  previousLabel: string | null,
  nextLabel: string | null
) {
  return invalidateAiDerivedContent(tx, consultationId, actorUserId, {
    fieldOperation: 'invalidar_remapeamento_voz',
    draftStatus: 'invalidado_remapeamento_voz',
    quarantineKind: 'remapeamento_vozes',
    reason: 'A associacao de voz mudou; resultados anteriores da IA foram invalidados.',
    metadata: { previousLabel, nextLabel },
  })
}

async function invalidateAiDerivedContent(
  tx: Prisma.TransactionClient,
  consultationId: string,
  actorUserId: string,
  context: {
    fieldOperation: string
    draftStatus: string
    quarantineKind: string
    reason: string
    metadata: Record<string, unknown>
  }
) {
  const aiValues = await tx.consultationFieldValue.findMany({
    where: { consultationId, source: 'ia' },
    include: { document: { select: { kind: true } } },
  })
  for (const field of aiValues) {
    await tx.consultationFieldEvent.create({
      data: {
        consultationId,
        fieldValueId: field.id,
        documentKind: field.document.kind,
        fieldId: field.fieldId,
        operation: context.fieldOperation,
        previousValueJson: field.valueJson,
        nextValueJson: null,
        actorType: 'profissional',
        actorUserId,
        metadataJson: protectJson(context.metadata, field.document.kind),
      },
    })
  }
  if (aiValues.length) {
    await tx.consultationFieldValue.deleteMany({
      where: { id: { in: aiValues.map((field) => field.id) } },
    })
  }
  await tx.consultationAiState.updateMany({
    where: { consultationId },
    data: {
      lastProcessedSequence: 0,
      processingThroughSequence: null,
      processingStartedAt: null,
      fieldMetaJson: '{}',
      suggestionsJson: '[]',
      finalReviewAt: null,
    },
  })
  const generatedDrafts = await tx.generatedClinicalDocument.findMany({
    where: { consultationId, source: 'ia', status: 'rascunho', deletedAt: null },
    select: { id: true, documentKind: true },
  })
  for (const document of generatedDrafts) {
    await tx.generatedClinicalDocument.update({
      where: { id: document.id },
      data: {
        status: context.draftStatus,
        contentJson: document.documentKind === 'restrito' ? protectSensitiveText('{}') : '{}',
        sourceSnapshot: null,
      },
    })
  }
  await tx.consultationQuarantineItem.create({
    data: {
      consultationId,
      kind: context.quarantineKind,
      reason: context.reason,
      payloadJson: protectSensitiveText(JSON.stringify(context.metadata)),
    },
  })
}

export async function upsertDynamicParticipant(
  req: FastifyRequest<{
    Params: { id: string; participantId?: string }
    Body: {
      name?: string
      role?: string
      speakerLabel?: string | null
      authorized?: boolean
      active?: boolean
    }
  }>,
  reply: FastifyReply
) {
  let consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (consultation.formMode !== 'dynamic') return reply.status(409).send({ error: 'Consulta utiliza o prontuario legado' })
  if (documentWasDeleted(consultation, 'compartilhavel')) {
    return reply.status(410).send({ error: 'O prontuario compartilhavel foi excluido pela politica de retencao' })
  }
  if (normalizeConsultationStatus(consultation.status) === CONSULTATION_STATUS.FINISHED) {
    return reply.status(409).send({ error: 'Participantes nao podem ser alterados apos a finalizacao' })
  }

  await ensureCoreParticipants(consultation)
  consultation = await findOwnedConsultation(consultation.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })

  const participantId = req.params.participantId
  const name = req.body?.name?.trim()
  const role = req.body?.role?.trim()
  const speakerLabel = req.body?.speakerLabel?.trim() || null
  if (req.body?.authorized !== undefined) {
    return reply.status(400).send({
      error: 'Registre autorizacao ou recusa pelo endpoint de consentimentos',
    })
  }
  if (name && name.length > 120) return reply.status(400).send({ error: 'O nome do participante e muito longo' })
  if (role && !PARTICIPANT_ROLES.has(role)) return reply.status(400).send({ error: 'Papel de participante invalido' })
  if (speakerLabel && speakerLabel.length > 80) return reply.status(400).send({ error: 'O rotulo da voz e muito longo' })
  if (speakerLabel) {
    const duplicate = consultation.participants.find((participant) =>
      participant.speakerLabel === speakerLabel && participant.id !== participantId
    )
    if (duplicate) return reply.status(409).send({ error: 'Esta voz ja esta associada a outro participante' })
  }

  if (participantId) {
    const owned = consultation.participants.find((participant) => participant.id === participantId)
    if (!owned) return reply.status(404).send({ error: 'Participante nao encontrado' })
    const isCoreParticipant = owned.role === 'profissional' || owned.role === 'paciente'
    if (isCoreParticipant && role && role !== owned.role) {
      return reply.status(400).send({ error: 'O papel dos participantes principais nao pode ser alterado' })
    }
    if (!isCoreParticipant && (role === 'profissional' || role === 'paciente')) {
      return reply.status(400).send({ error: 'Profissional e paciente sao participantes protegidos da consulta' })
    }
    if (isCoreParticipant && req.body?.active === false) {
      return reply.status(400).send({ error: 'Participantes principais nao podem ser desativados' })
    }
    const updated = await getPrisma().$transaction(async (tx) => {
      const saved = await tx.consultationParticipant.update({
        where: { id: owned.id },
        data: {
          ...(name ? { name } : {}),
          ...(role ? { role } : {}),
          ...(req.body?.speakerLabel !== undefined ? { speakerLabel } : {}),
          ...(req.body?.active !== undefined ? { active: req.body.active } : {}),
        },
      })
      await tx.consultationParticipantEvent.create({
        data: {
          consultationId: consultation.id,
          participantId: owned.id,
          operation: owned.speakerLabel !== saved.speakerLabel
            ? owned.speakerLabel ? 'remapear_voz' : 'associar_voz'
            : 'editar_participante',
          previousJson: protectSensitiveText(JSON.stringify(participantAuditSnapshot(owned))),
          nextJson: protectSensitiveText(JSON.stringify(participantAuditSnapshot(saved))),
          actorUserId: req.authUser!.id,
        },
      })
      const participationChanged = owned.active !== saved.active || owned.role !== saved.role
      if (participationChanged) {
        await invalidateAiDerivedContent(tx, consultation.id, req.authUser!.id, {
          fieldOperation: 'invalidar_alteracao_participante',
          draftStatus: 'invalidado_alteracao_participante',
          quarantineKind: 'consentimento_revogado',
          reason: 'A participacao clinica mudou; resultados anteriores da IA foram invalidados.',
          metadata: {
            participantId: owned.id,
            previousRole: owned.role,
            nextRole: saved.role,
            previousActive: owned.active,
            nextActive: saved.active,
          },
        })
      } else if (owned.speakerLabel !== saved.speakerLabel) {
        await invalidateAiAfterSpeakerRemap(
          tx,
          consultation.id,
          req.authUser!.id,
          owned.speakerLabel,
          saved.speakerLabel
        )
      }
      return saved
    })
    return reply.send(updated)
  }

  if (!name || !role) return reply.status(400).send({ error: 'Informe nome e papel do participante' })
  if (role === 'profissional' || role === 'paciente') {
    return reply.status(400).send({ error: 'Profissional e paciente sao cadastrados automaticamente' })
  }
  const created = await getPrisma().$transaction(async (tx) => {
    const participant = await tx.consultationParticipant.create({
      data: {
        consultationId: consultation.id,
        name,
        role,
        speakerLabel,
        authorized: false,
        active: req.body?.active ?? true,
      },
    })
    await tx.consultationParticipantEvent.create({
      data: {
        consultationId: consultation.id,
        participantId: participant.id,
        operation: 'cadastrar_participante',
        nextJson: protectSensitiveText(JSON.stringify(participantAuditSnapshot(participant))),
        actorUserId: req.authUser!.id,
      },
    })
    return participant
  })
  return reply.status(201).send(created)
}

export async function recordDynamicConsent(
  req: FastifyRequest<{
    Params: { id: string }
    Body: {
      type?: 'gravacao_audio' | 'transcricao_ia' | 'participacao'
      granted?: boolean
      participantId?: string
      evidence?: Record<string, unknown>
    }
  }>,
  reply: FastifyReply
) {
  let consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (consultation.formMode !== 'dynamic') {
    return reply.status(409).send({ error: 'Consulta utiliza o prontuario legado' })
  }
  if (documentWasDeleted(consultation, 'compartilhavel')) {
    return reply.status(410).send({ error: 'O prontuario compartilhavel foi excluido pela politica de retencao' })
  }
  if (normalizeConsultationStatus(consultation.status) === CONSULTATION_STATUS.FINISHED) {
    return reply.status(409).send({ error: 'Consulta finalizada nao aceita novos consentimentos' })
  }
  await ensureCoreParticipants(consultation)
  consultation = await findOwnedConsultation(consultation.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  const type = req.body?.type
  if (!type || typeof req.body?.granted !== 'boolean') {
    return reply.status(400).send({ error: 'Informe o tipo e a decisao do consentimento' })
  }
  if (type !== 'participacao' && req.body?.participantId) {
    return reply.status(400).send({ error: 'Consentimentos de audio e IA pertencem a consulta, nao a um participante isolado' })
  }
  if (req.body?.participantId && !consultation.participants.some((item) => item.id === req.body?.participantId)) {
    return reply.status(404).send({ error: 'Participante nao encontrado' })
  }
  if (type === 'participacao' && !req.body?.participantId) {
    return reply.status(400).send({ error: 'Informe o participante deste consentimento' })
  }
  const evidenceJson = req.body?.evidence ? JSON.stringify(req.body.evidence) : null
  if (evidenceJson && evidenceJson.length > 20_000) {
    return reply.status(400).send({ error: 'A evidencia do consentimento excede o limite permitido' })
  }

  const participantBefore = req.body?.participantId
    ? consultation.participants.find((item) => item.id === req.body?.participantId)
    : undefined
  const previousConsent = consultation.consents.find((item) =>
    item.type === type && item.participantId === (req.body?.participantId || null)
  )
  const created = await getPrisma().$transaction(async (tx) => {
    const consent = await tx.consultationConsent.create({
      data: {
        consultationId: consultation.id,
        participantId: req.body?.participantId || null,
        type,
        granted: req.body!.granted!,
        termsVersion: CONSENT_TERMS_VERSION,
        evidenceJson: evidenceJson ? protectSensitiveText(evidenceJson) : null,
      },
    })
    if (type === 'participacao' && req.body?.participantId) {
      const participant = await tx.consultationParticipant.update({
        where: { id: req.body.participantId },
        data: {
          authorized: req.body.granted,
          authorizedAt: req.body.granted ? new Date() : null,
        },
      })
      await tx.consultationParticipantEvent.create({
        data: {
          consultationId: consultation.id,
          participantId: participant.id,
          operation: req.body.granted ? 'autorizar_participacao' : 'revogar_participacao',
          previousJson: participantBefore
            ? protectSensitiveText(JSON.stringify(participantAuditSnapshot(participantBefore)))
            : null,
          nextJson: protectSensitiveText(JSON.stringify(participantAuditSnapshot(participant))),
          actorUserId: req.authUser!.id,
        },
      })
      if (participantBefore?.authorized && !req.body.granted) {
        await invalidateAiDerivedContent(tx, consultation.id, req.authUser!.id, {
          fieldOperation: 'invalidar_revogacao_participante',
          draftStatus: 'invalidado_consentimento',
          quarantineKind: 'consentimento_revogado',
          reason: 'O consentimento de um participante foi revogado; resultados anteriores da IA foram invalidados.',
          metadata: {
            participantId: participant.id,
            speakerLabel: participantBefore.speakerLabel,
            consentType: type,
          },
        })
      }
    } else if (type === 'transcricao_ia' && previousConsent?.granted && !req.body.granted) {
      await invalidateAiDerivedContent(tx, consultation.id, req.authUser!.id, {
        fieldOperation: 'invalidar_revogacao_ia',
        draftStatus: 'invalidado_consentimento',
        quarantineKind: 'consentimento_revogado',
        reason: 'O consentimento de transcricao e IA foi revogado; resultados anteriores da IA foram invalidados.',
        metadata: { consentType: type },
      })
    }
    return consent
  })
  return reply.status(201).send({
    ...created,
    evidenceJson,
    evidence: req.body?.evidence || null,
  })
}

export async function assertDynamicRecordingConsent(consultationId: string, userId: string) {
  let consultation = await findOwnedConsultation(consultationId, userId)
  if (!consultation || consultation.formMode !== 'dynamic') return
  if (!dynamicFormsEnabled()) {
    throw new ConsentRequiredError('Os formularios dinamicos de Psicologia estao desativados')
  }
  assertDocumentAvailable(consultation)

  await ensureCoreParticipants(consultation)
  consultation = await findOwnedConsultation(consultationId, userId)
  if (!consultation) throw new ConsentRequiredError('Consulta nao encontrada durante a validacao')

  const latestByType = new Map<string, (typeof consultation.consents)[number]>()
  for (const consent of consultation.consents) {
    if (!latestByType.has(consent.type)) latestByType.set(consent.type, consent)
  }
  if (!latestByType.get('gravacao_audio')?.granted || !latestByType.get('transcricao_ia')?.granted) {
    throw new ConsentRequiredError('Registre os consentimentos de gravacao e transcricao/IA antes de iniciar')
  }
  const unauthorizedParticipant = consultation.participants.find((participant) => {
    if (!participant.active || participant.role === 'profissional') return false
    const latestConsent = consultation.consents.find((consent) =>
      consent.type === 'participacao' && consent.participantId === participant.id
    )
    return !participant.authorized || latestConsent?.granted !== true || Boolean(latestConsent.revokedAt)
  })
  if (unauthorizedParticipant) {
    throw new ConsentRequiredError(`Confirme a participacao de ${unauthorizedParticipant.name} antes de gravar`)
  }
}

function transcriptSegmentsFromStored(
  consultation: NonNullable<Awaited<ReturnType<typeof findOwnedConsultation>>>,
  stored: Array<{ id: string; sequence: number; text: string; payload: string | null; createdAt?: Date }>
): DynamicTranscriptSegment[] {
  const participantsByLabel = new Map(
    consultation.participants.filter((item) => item.speakerLabel).map((item) => [item.speakerLabel!, item])
  )
  return stored.map((segment) => {
    const payload = parseJson<{ speakerLabel?: string; startMs?: number; endMs?: number }>(segment.payload, {})
    const participant = payload.speakerLabel ? participantsByLabel.get(payload.speakerLabel) : undefined
    return {
      id: segment.id,
      sequence: segment.sequence,
      text: segment.text,
      speakerLabel: payload.speakerLabel || null,
      participantId: participant?.id || null,
      participantRole: participant?.role || null,
      participantAuthorized: participant
        ? participantWasAuthorizedAt(consultation, participant, segment.createdAt || consultation.audioSavedAt)
        : undefined,
      startMs: payload.startMs ?? null,
      endMs: payload.endMs ?? null,
    }
  })
}

function participantWasAuthorizedAt(
  consultation: NonNullable<Awaited<ReturnType<typeof findOwnedConsultation>>>,
  participant: (typeof consultation.participants)[number],
  referenceAt?: Date | null
) {
  if (!participant.active) return false
  if (participant.role === 'profissional') return true
  const latestConsent = consultation.consents.find((consent) =>
    consent.type === 'participacao' && consent.participantId === participant.id
  )
  if (!participant.authorized || latestConsent?.granted !== true || latestConsent.revokedAt) return false
  if (referenceAt && latestConsent.recordedAt.getTime() > referenceAt.getTime()) return false
  return true
}

function transcriptSegmentsFromTurns(
  consultation: NonNullable<Awaited<ReturnType<typeof findOwnedConsultation>>>,
  turns: DialogueTurn[]
): DynamicTranscriptSegment[] {
  const participantsByLabel = new Map(
    consultation.participants.filter((item) => item.speakerLabel).map((item) => [item.speakerLabel!, item])
  )
  return turns.map((turn, index) => {
    const participant = turn.diarizationLabel
      ? participantsByLabel.get(turn.diarizationLabel)
      : undefined
    return {
      id: `diarized-${index + 1}`,
      sequence: index + 1,
      text: turn.text,
      speakerLabel: turn.diarizationLabel || null,
      participantId: participant?.id || null,
      participantRole: participant?.role || null,
      participantAuthorized: participant
        ? participantWasAuthorizedAt(consultation, participant, consultation.audioSavedAt)
        : undefined,
      startMs: turn.start == null ? null : Math.round(turn.start * 1000),
      endMs: turn.end == null ? null : Math.round(turn.end * 1000),
    }
  })
}

async function applyAiOutput(
  consultation: NonNullable<Awaited<ReturnType<typeof findOwnedConsultation>>>,
  updates: DynamicFieldUpdate[],
  quarantine: Array<{ kind: string; reason: string; sourceText: string | null; segmentId: string | null; payload?: unknown }>,
  riskAlerts: Array<{ kind: string; severity: string; summary: string; evidence: unknown[] }>,
  fullReconciliation = false
) {
  const prisma = getPrisma()
  const documents = new Map(consultation.documents.map((document) => [document.kind, document]))

  await prisma.$transaction(async (tx) => {
    if (fullReconciliation) {
      const retainedKeys = new Set(
        updates
          .filter((update) =>
            update.aiMode !== 'sugerir_revisao' && update.reviewStatus !== 'revisao_obrigatoria'
          )
          .map((update) => `${update.documentKind}:${update.fieldId}`)
      )
      const staleAiValues = await tx.consultationFieldValue.findMany({
        where: {
          consultationId: consultation.id,
          source: 'ia',
          reviewStatus: { not: 'confirmado' },
        },
        include: { document: { select: { kind: true } } },
      })
      for (const stale of staleAiValues) {
        if (retainedKeys.has(`${stale.document.kind}:${stale.fieldId}`)) continue
        await tx.consultationFieldEvent.create({
          data: {
            consultationId: consultation.id,
            fieldValueId: stale.id,
            documentKind: stale.document.kind,
            fieldId: stale.fieldId,
            operation: 'remover_ia_na_reconciliacao',
            previousValueJson: stale.valueJson,
            nextValueJson: null,
            actorType: 'ia',
            metadataJson: protectJson({
              reason: 'O valor nao encontrou suporte na reinterpretacao integral mais recente.',
            }, stale.document.kind),
          },
        })
      }
      const staleIds = staleAiValues
        .filter((stale) => !retainedKeys.has(`${stale.document.kind}:${stale.fieldId}`))
        .map((stale) => stale.id)
      if (staleIds.length) {
        await tx.consultationFieldValue.deleteMany({ where: { id: { in: staleIds } } })
      }
    }

    for (const update of updates) {
      const document = documents.get(update.documentKind)
      if (!document || document.deletedAt) continue
      const existing = await tx.consultationFieldValue.findUnique({
        where: { documentId_fieldId: { documentId: document.id, fieldId: update.fieldId } },
      })
      if (update.aiMode === 'sugerir_revisao' || update.reviewStatus === 'revisao_obrigatoria') {
        await tx.consultationQuarantineItem.create({
          data: {
            consultationId: consultation.id,
            kind: 'sugestao_ia',
            reason: 'Campo configurado para revisao profissional antes do preenchimento.',
            sourceText: update.documentKind === 'restrito'
              ? protectSensitiveText(update.evidence.map((item) => item.quote).join(' | '))
              : update.evidence.map((item) => item.quote).join(' | '),
            payloadJson: update.documentKind === 'restrito'
              ? protectSensitiveText(JSON.stringify(update))
              : JSON.stringify(update),
          },
        })
        continue
      }
      if (existing?.source === 'manual' || existing?.reviewStatus === 'confirmado') {
        await tx.consultationQuarantineItem.create({
          data: {
            consultationId: consultation.id,
            kind: 'conflito',
            reason: 'A IA nao pode sobrescrever um valor confirmado ou manual.',
            sourceText: update.documentKind === 'restrito'
              ? protectSensitiveText(update.evidence.map((item) => item.quote).join(' | '))
              : update.evidence.map((item) => item.quote).join(' | '),
            payloadJson: update.documentKind === 'restrito'
              ? protectSensitiveText(JSON.stringify(update))
              : JSON.stringify(update),
          },
        })
        continue
      }

      const valueJson = protectJson(update.value, update.documentKind)
      const saved = await tx.consultationFieldValue.upsert({
        where: { documentId_fieldId: { documentId: document.id, fieldId: update.fieldId } },
        create: {
          consultationId: consultation.id,
          documentId: document.id,
          fieldId: update.fieldId,
          valueJson,
          source: 'ia',
          reviewStatus: update.reviewStatus,
          evidenceJson: protectJson(update.evidence, update.documentKind),
        },
        update: {
          valueJson,
          source: 'ia',
          reviewStatus: update.reviewStatus,
          evidenceJson: protectJson(update.evidence, update.documentKind),
          revision: { increment: 1 },
        },
      })
      await tx.consultationFieldEvent.create({
        data: {
          consultationId: consultation.id,
          fieldValueId: saved.id,
          documentKind: update.documentKind,
          fieldId: update.fieldId,
          operation: existing ? 'atualizar_ia' : 'preencher_ia',
          previousValueJson: existing?.valueJson || null,
          nextValueJson: valueJson,
          actorType: 'ia',
          metadataJson: protectJson({
            reviewStatus: update.reviewStatus,
            confidence: update.confidence,
            uncertainty: update.uncertainty,
            evidence: update.evidence,
          }, update.documentKind),
        },
      })
    }

    for (const item of quarantine) {
      const serializedPayload = item.payload == null ? null : JSON.stringify(item.payload)
      await tx.consultationQuarantineItem.create({
        data: {
          consultationId: consultation.id,
          kind: item.kind,
          reason: item.reason,
          sourceText: item.sourceText ? protectSensitiveText(item.sourceText) : null,
          payloadJson: serializedPayload ? protectSensitiveText(serializedPayload) : null,
        },
      })
    }
    for (const alert of riskAlerts) {
      await tx.consultationQuarantineItem.create({
        data: {
          consultationId: consultation.id,
          kind: 'alerta_risco',
          reason: `Alerta de risco ${alert.severity}: exige confirmacao profissional`,
          sourceText: null,
          payloadJson: protectSensitiveText(JSON.stringify(alert)),
        },
      })
    }
  })
}

async function runDynamicInterpretation(input: {
  consultation: NonNullable<Awaited<ReturnType<typeof findOwnedConsultation>>>
  ownerId: string
  force?: boolean
  finalReview?: boolean
  segments?: DynamicTranscriptSegment[]
}) {
  assertDocumentAvailable(input.consultation)
  const definition = definitionForConsultation(input.consultation)
  const manifest = manifestForConsultation(input.consultation, definition)
  const prisma = getPrisma()
  let aiState = await prisma.consultationAiState.upsert({
    where: { consultationId: input.consultation.id },
    create: {
      consultationId: input.consultation.id,
      templateId: `dynamic:${input.consultation.formTemplateVersionId}`,
      promptVersion: 'dynamic-psychology-responses-v1',
      schemaVersion: manifest.schemaVersion,
    },
    update: {},
  })

  if (
    aiState.processingThroughSequence != null &&
    aiState.processingStartedAt &&
    Date.now() - aiState.processingStartedAt.getTime() > DYNAMIC_AI_PROCESSING_LEASE_MS
  ) {
    await prisma.consultationAiState.updateMany({
      where: {
        id: aiState.id,
        processingStartedAt: aiState.processingStartedAt,
      },
      data: { processingThroughSequence: null, processingStartedAt: null },
    })
    aiState = await prisma.consultationAiState.findUniqueOrThrow({ where: { id: aiState.id } })
  }

  if (aiState.processingThroughSequence != null) {
    return {
      updates: [],
      quarantine: [],
      riskAlerts: [],
      processedThroughSequence: aiState.lastProcessedSequence,
      processing: true,
    }
  }

  const storedSegments = input.segments ? [] : await prisma.consultationTranscriptSegment.findMany({
    where: {
      consultationId: input.consultation.id,
      ...(input.force || input.finalReview ? {} : { sequence: { gt: aiState.lastProcessedSequence } }),
    },
    orderBy: { sequence: 'asc' },
  })
  const segments = input.segments || transcriptSegmentsFromStored(input.consultation, storedSegments)
  if (!segments.length) {
    return {
      updates: [],
      quarantine: [],
      riskAlerts: [],
      processedThroughSequence: aiState.lastProcessedSequence,
      processing: false,
    }
  }

  const lastSequence = Math.max(...segments.map((segment) => segment.sequence))
  const processingThroughSequence = Math.max(aiState.lastProcessedSequence, lastSequence)
  let leaseTimestamp = new Date()
  const claim = await prisma.consultationAiState.updateMany({
    where: { id: aiState.id, processingThroughSequence: null },
    data: { processingThroughSequence, processingStartedAt: leaseTimestamp },
  })
  if (!claim.count) {
    return {
      updates: [],
      quarantine: [],
      riskAlerts: [],
      processedThroughSequence: aiState.lastProcessedSequence,
      processing: true,
    }
  }

  try {
    const output = await extractDynamicFormDelta({
      ownerId: input.ownerId,
      templateVersionKey: input.consultation.formTemplateVersion?.checksum || input.consultation.formTemplateVersionId!,
      manifest,
      currentValues: await currentValues(input.consultation, manifest),
      segments,
      finalReview: input.finalReview,
    })

    // Renova a posse antes de persistir. Se outra requisicao recuperou uma
    // concessao expirada, este resultado antigo e descartado sem tocar no PEP.
    const renewedAt = new Date()
    const renewed = await prisma.consultationAiState.updateMany({
      where: {
        id: aiState.id,
        processingThroughSequence,
        processingStartedAt: leaseTimestamp,
      },
      data: { processingStartedAt: renewedAt },
    })
    if (!renewed.count) {
      return {
        updates: [],
        quarantine: [],
        riskAlerts: [],
        processedThroughSequence: aiState.lastProcessedSequence,
        processing: true,
      }
    }
    leaseTimestamp = renewedAt

    await applyAiOutput(
      input.consultation,
      output.updates,
      output.quarantine,
      output.riskAlerts,
      Boolean(input.force || input.finalReview)
    )
    await prisma.consultationAiState.updateMany({
      where: {
        id: aiState.id,
        processingThroughSequence,
        processingStartedAt: leaseTimestamp,
      },
      data: {
        templateId: `dynamic:${input.consultation.formTemplateVersionId}`,
        lastProcessedSequence: input.finalReview
          ? aiState.lastProcessedSequence
          : processingThroughSequence,
        processingThroughSequence: null,
        processingStartedAt: null,
        promptVersion: 'dynamic-psychology-responses-v1',
        schemaVersion: manifest.schemaVersion,
        finalReviewAt: input.finalReview ? new Date() : aiState.finalReviewAt,
      },
    })
    return { ...output, processedThroughSequence: processingThroughSequence, processing: false }
  } catch (error) {
    await prisma.consultationAiState.updateMany({
      where: {
        id: aiState.id,
        processingThroughSequence,
        processingStartedAt: leaseTimestamp,
      },
      data: { processingThroughSequence: null, processingStartedAt: null },
    })
    throw error
  }
}

export async function reinterpretDynamicConsultation(
  req: FastifyRequest<{ Params: { id: string }; Body: { force?: boolean } }>,
  reply: FastifyReply
) {
  if (!dynamicFormsEnabled()) return reply.status(404).send({ error: 'Formularios dinamicos estao desativados' })
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (consultation.formMode !== 'dynamic') return reply.status(409).send({ error: 'Consulta utiliza o prontuario legado' })
  if (normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.IN_PROGRESS) {
    return reply.status(409).send({ error: 'A IA clinica so pode interpretar uma consulta em andamento' })
  }
  if (!consultation.transcript?.trim()) return reply.send({ updates: [], quarantine: [], riskAlerts: [], processing: false })

  await assertDynamicRecordingConsent(consultation.id, req.authUser!.id)

  try {
    const diarizedTurns = req.body?.force
      ? parseJson<DialogueTurn[]>(consultation.transcriptStructured, [])
      : []
    const result = await runDynamicInterpretation({
      consultation,
      ownerId: req.authUser!.id,
      force: req.body?.force,
      segments: diarizedTurns.length
        ? transcriptSegmentsFromTurns(consultation, diarizedTurns)
        : undefined,
    })
    return reply.send(result)
  } catch (error) {
    console.error('[dynamic-ai] Falha na interpretacao:', error)
    return reply.status(502).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel interpretar o formulario',
    })
  }
}

export async function diarizeDynamicConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (consultation.formMode !== 'dynamic') return reply.status(409).send({ error: 'Consulta utiliza o prontuario legado' })
  if (normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.IN_PROGRESS) {
    return reply.status(409).send({ error: 'A identificacao de vozes so ocorre durante uma consulta em andamento' })
  }
  if (!consultation.audioPath) return reply.status(400).send({ error: 'Audio completo nao disponivel para diarizacao' })
  if (consultation.transcriptSegments.some((segment) => segment.kind === 'transcricao_corrigida')) {
    return reply.status(409).send({
      error: 'A transcricao foi corrigida. Revise manualmente as vozes; o audio antigo nao pode substituir a correcao.',
      code: 'TRANSCRIPT_EDIT_REVIEW_REQUIRED',
    })
  }

  await assertDynamicRecordingConsent(consultation.id, req.authUser!.id)

  try {
    const turns = await diarizeAudio(consultation.audioPath)
    await getPrisma().consultation.update({
      where: { id: consultation.id },
      data: { transcriptStructured: JSON.stringify(turns) },
    })
    const mappedLabels = new Set(consultation.participants.map((item) => item.speakerLabel).filter(Boolean))
    const unknownLabels = Array.from(new Set(
      turns.map((turn) => turn.diarizationLabel).filter((label): label is string => Boolean(label && !mappedLabels.has(label)))
    ))
    return reply.send({ turns, unknownLabels, requiresConfirmation: unknownLabels.length > 0 })
  } catch (error) {
    console.error('[diarizacao] Falha:', error)
    return reply.status(502).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel separar as vozes',
    })
  }
}

export async function getDynamicConversationTopics(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  if (!dynamicFormsEnabled()) return reply.status(404).send({ error: 'Formularios dinamicos estao desativados' })
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (consultation.formMode !== 'dynamic') {
    return reply.status(409).send({ error: 'Consulta utiliza o prontuario legado' })
  }
  if (normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.IN_PROGRESS) {
    return reply.status(409).send({ error: 'Os topicos por IA so podem ser gerados durante uma consulta em andamento' })
  }

  await assertDynamicRecordingConsent(consultation.id, req.authUser!.id)

  try {
    const definition = definitionForConsultation(consultation)
    const turns = parseJson<DialogueTurn[]>(consultation.transcriptStructured, [])
    const segments = turns.length
      ? transcriptSegmentsFromTurns(consultation, turns)
      : transcriptSegmentsFromStored(consultation, consultation.transcriptSegments)
    const topics = await suggestDynamicConversationTopics({
      ownerId: req.authUser!.id,
      templateVersionKey: consultation.formTemplateVersion?.checksum || consultation.formTemplateVersionId!,
      manifest: manifestForConsultation(consultation, definition),
      segments,
    })
    return reply.send({ topics })
  } catch (error) {
    console.error('[dynamic-topics] Falha:', error)
    return reply.status(502).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel organizar os topicos',
    })
  }
}

export async function generateDynamicDocument(
  req: FastifyRequest<{
    Params: { id: string }
    Body: {
      format?: GeneratedDocumentFormat
      documentKind?: 'compartilhavel' | 'restrito'
      manualContent?: Record<string, unknown>
    }
  }>,
  reply: FastifyReply
) {
  if (!dynamicFormsEnabled()) return reply.status(404).send({ error: 'Formularios dinamicos estao desativados' })
  let consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (consultation.formMode !== 'dynamic') return reply.status(409).send({ error: 'Consulta utiliza o prontuario legado' })
  if (normalizeConsultationStatus(consultation.status) !== CONSULTATION_STATUS.IN_PROGRESS) {
    return reply.status(409).send({ error: 'Gere a evolucao enquanto a consulta estiver em andamento' })
  }

  const definition = definitionForConsultation(consultation)
  const format = req.body?.format || definition.defaultDocumentFormat
  const documentKind = req.body?.documentKind || 'compartilhavel'
  if (!['SOAP', 'DAP', 'BIRP'].includes(format)) return reply.status(400).send({ error: 'Formato de evolucao invalido' })
  if (!definition.documents.some((document) => document.kind === documentKind)) {
    return reply.status(400).send({ error: 'Documento nao existe no formulario publicado' })
  }

  await ensureDynamicDocuments(consultation.id, definition)
  consultation = await findOwnedConsultation(consultation.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (documentWasDeleted(consultation, documentKind)) {
    return reply.status(410).send({
      error: `O documento ${documentKind} foi excluido pela politica de retencao e nao pode ser recriado`,
    })
  }

  if (req.body?.manualContent !== undefined) {
    const raw = req.body.manualContent
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return reply.status(400).send({ error: 'Conteudo manual invalido' })
    }
    const rawSections = raw.sections
    const content: Record<string, unknown> = {
      format,
      documentKind,
      sections: Array.isArray(rawSections)
        ? rawSections.map((section) => {
            const item = section && typeof section === 'object' && !Array.isArray(section)
              ? section as Record<string, unknown>
              : {}
            return {
              key: item.key,
              title: item.title,
              content: item.content,
              evidenceSegmentIds: item.evidenceSegmentIds ?? [],
            }
          })
        : rawSections,
      warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
      requiresProfessionalReview: true,
    }
    const validationError = validateGeneratedDocumentContent(content, format)
    if (validationError) return reply.status(400).send({ error: validationError })
    const evidenceError = validateGeneratedDocumentEvidence(content, new Set())
    if (evidenceError) return reply.status(400).send({ error: evidenceError })

    const manifest = manifestForConsultation(consultation, definition)
    const snapshotObject = await documentSourceSnapshot(
      consultation,
      manifest,
      documentKind,
      [],
      true
    )
    const contentJson = documentKind === 'restrito'
      ? protectSensitiveText(JSON.stringify(content))
      : JSON.stringify(content)
    const sourceSnapshot = documentKind === 'restrito'
      ? protectSensitiveText(JSON.stringify(snapshotObject))
      : JSON.stringify(snapshotObject)
    const saved = await getPrisma().generatedClinicalDocument.create({
      data: {
        consultationId: consultation.id,
        format,
        documentKind,
        status: 'rascunho',
        source: 'manual',
        createdBy: req.authUser!.id,
        contentJson,
        sourceSnapshot,
        deleteAt: consultation.documents.find((item) => item.kind === documentKind)?.deleteAt || null,
        legalHold: consultation.documents.find((item) => item.kind === documentKind)?.legalHold || false,
      },
    })
    return reply.status(201).send({
      ...withoutSourceSnapshot(saved),
      contentJson: JSON.stringify(content),
      requiresProfessionalReview: true,
    })
  }

  if (!consultation.transcript?.trim()) return reply.status(400).send({ error: 'Nenhuma transcricao disponivel' })
  await assertDynamicRecordingConsent(consultation.id, req.authUser!.id)

  try {
    let turns = parseJson<DialogueTurn[]>(consultation.transcriptStructured, [])
    const hasEditedTranscript = consultation.transcriptSegments.some(
      (segment) => segment.kind === 'transcricao_corrigida'
    )
    if (!turns.length && consultation.audioPath && !hasEditedTranscript) {
      turns = await diarizeAudio(consultation.audioPath)
      await getPrisma().consultation.update({
        where: { id: consultation.id },
        data: { transcriptStructured: JSON.stringify(turns) },
      })
    }
    consultation = await findOwnedConsultation(consultation.id, req.authUser!.id)
    if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
    const segments = turns.length
      ? transcriptSegmentsFromTurns(consultation, turns)
      : transcriptSegmentsFromStored(consultation, consultation.transcriptSegments)
    if (!segments.length) {
      return reply.status(409).send({
        error: 'Separe e confirme as vozes antes de gerar a evolucao',
        code: 'SPEAKER_CONFIRMATION_REQUIRED',
        unknownLabels: ['Indefinido'],
        turns,
      })
    }
    const unknownLabels = Array.from(new Set(
      segments.filter((segment) => segment.participantAuthorized !== true).map((segment) => segment.speakerLabel || 'Indefinido')
    ))
    if (unknownLabels.length) {
      return reply.status(409).send({
        error: 'Confirme a identidade e autorizacao de todas as vozes antes de gerar a evolucao',
        code: 'SPEAKER_CONFIRMATION_REQUIRED',
        unknownLabels,
        turns,
      })
    }

    await runDynamicInterpretation({
      consultation,
      ownerId: req.authUser!.id,
      force: true,
      finalReview: true,
      segments,
    })
    const refreshed = await findOwnedConsultation(consultation.id, req.authUser!.id)
    if (!refreshed) return reply.status(404).send({ error: 'Consulta nao encontrada' })
    const manifest = manifestForConsultation(refreshed, definition)
    const generated = await generateDynamicClinicalDocument({
      ownerId: req.authUser!.id,
      templateVersionKey: refreshed.formTemplateVersion?.checksum || refreshed.formTemplateVersionId!,
      manifest,
      documentKind,
      format,
      values: await currentValues(refreshed, manifest),
      transcript: segments,
    })
    const evidenceError = validateGeneratedDocumentEvidence(
      generated as unknown as Record<string, unknown>,
      new Set(segments.map((segment) => segment.id)),
      true
    )
    if (evidenceError) throw new Error(evidenceError)
    const citedSegmentIds = new Set(
      generated.sections.flatMap((section) => section.evidenceSegmentIds)
    )
    const sourceSnapshotObject = await documentSourceSnapshot(
      refreshed,
      manifest,
      documentKind,
      segments.filter((segment) => citedSegmentIds.has(segment.id))
    )
    const contentJson = documentKind === 'restrito'
      ? protectSensitiveText(JSON.stringify(generated))
      : JSON.stringify(generated)
    const sourceSnapshot = documentKind === 'restrito'
      ? protectSensitiveText(JSON.stringify(sourceSnapshotObject))
      : JSON.stringify(sourceSnapshotObject)
    const saved = await getPrisma().generatedClinicalDocument.create({
      data: {
        consultationId: refreshed.id,
        format,
        documentKind,
        status: 'rascunho',
        source: 'ia',
        createdBy: req.authUser!.id,
        contentJson,
        sourceSnapshot,
        deleteAt: refreshed.documents.find((item) => item.kind === documentKind)?.deleteAt || null,
        legalHold: refreshed.documents.find((item) => item.kind === documentKind)?.legalHold || false,
      },
    })
    return reply.status(201).send({
      ...withoutSourceSnapshot(saved),
      contentJson: JSON.stringify(generated),
      requiresProfessionalReview: true,
    })
  } catch (error) {
    console.error('[dynamic-document] Falha:', error)
    return reply.status(502).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel gerar a evolucao',
    })
  }
}

export async function confirmDynamicDocument(
  req: FastifyRequest<{
    Params: { id: string; documentId: string }
    Body: { content?: Record<string, unknown>; reason?: string }
  }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  const document = consultation.generatedDocuments.find((item) => item.id === req.params.documentId)
  if (!document) return reply.status(404).send({ error: 'Evolucao gerada nao encontrada' })
  if (documentWasDeleted(consultation, document.documentKind as 'compartilhavel' | 'restrito')) {
    return reply.status(410).send({ error: 'O documento-base foi excluido pela politica de retencao' })
  }
  const consultationStatus = normalizeConsultationStatus(consultation.status)
  if (consultationStatus !== CONSULTATION_STATUS.IN_PROGRESS && consultationStatus !== CONSULTATION_STATUS.FINISHED) {
    return reply.status(409).send({ error: 'Inicie a consulta antes de confirmar a evolucao' })
  }
  if (req.body?.reason && req.body.reason.length > 2_000) {
    return reply.status(400).send({ error: 'O motivo excede o limite permitido' })
  }
  if (consultationStatus === CONSULTATION_STATUS.FINISHED &&
    document.status !== 'confirmado' && !req.body?.reason?.trim()) {
    return reply.status(400).send({ error: 'Informe o motivo para confirmar um documento apos a finalizacao' })
  }

  const originalContent = parseJson<Record<string, unknown>>(
    document.documentKind === 'restrito' ? revealSensitiveText(document.contentJson) : document.contentJson,
    {}
  )
  const content = req.body?.content || originalContent
  const validationError = validateGeneratedDocumentContent(content, document.format)
  if (validationError) return reply.status(400).send({ error: validationError })
  const evidenceError = validateGeneratedDocumentEvidence(
    content,
    sourceSnapshotSegmentIds(document.sourceSnapshot, document.documentKind),
    document.source === 'ia'
  )
  if (evidenceError) return reply.status(400).send({ error: evidenceError })
  if (document.source === 'ia' &&
    generatedEvidenceFingerprint(content) !== generatedEvidenceFingerprint(originalContent)) {
    return reply.status(400).send({
      error: 'A proveniencia validada pela IA nao pode ser alterada; edite apenas o texto clinico',
    })
  }
  const pendingRiskAlert = consultation.quarantineItems.some(
    (item) => item.kind === 'alerta_risco' && item.status === 'pendente'
  )
  if (pendingRiskAlert) {
    return reply.status(409).send({
      error: 'Revise e resolva os alertas de risco antes de confirmar a evolucao',
      code: 'RISK_REVIEW_REQUIRED',
    })
  }
  const contentJson = document.documentKind === 'restrito'
    ? protectSensitiveText(JSON.stringify(content))
    : JSON.stringify(content)

  if (!hasCompleteEvolutionContent(document.format, content)) {
    return reply.status(422).send({
      error: `Preencha todas as secoes obrigatorias de ${document.format} antes de confirmar`,
    })
  }

  if (document.status === 'confirmado') {
    const reason = req.body?.reason?.trim()
    if (!reason) {
      return reply.status(400).send({ error: 'Informe o motivo do adendo ao documento confirmado' })
    }
    const amendment = await getPrisma().generatedClinicalDocument.create({
      data: {
        consultationId: consultation.id,
        format: document.format,
        documentKind: document.documentKind,
        status: 'confirmado',
        source: 'manual',
        createdBy: req.authUser!.id,
        contentJson,
        sourceSnapshot: document.sourceSnapshot,
        parentDocumentId: document.id,
        amendmentReason: reason,
        reviewedAt: new Date(),
        reviewedBy: req.authUser!.id,
        deleteAt: document.deleteAt,
        legalHold: document.legalHold,
      },
    })
    return reply.status(201).send({
      ...withoutSourceSnapshot(amendment),
      contentJson: JSON.stringify(content),
      isAmendment: true,
    })
  }


  try {
    await assertDynamicFinalizationReady(consultation.id, req.authUser!.id)
  } catch (error) {
    return reply.status(409).send({
      error: error instanceof Error ? error.message : 'Existem itens pendentes de revisao',
      code: 'DYNAMIC_REVIEW_REQUIRED',
    })
  }

  try {
    const updated = await getPrisma().$transaction(async (tx) => {
      const [liveConsultation, blockingItems, aiState, unauthorizedParticipants, latestAiConsent] = await Promise.all([
        tx.consultation.findUnique({ where: { id: consultation.id } }),
        tx.consultationQuarantineItem.count({
          where: {
            consultationId: consultation.id,
            status: 'pendente',
            kind: { in: Array.from(BLOCKING_QUARANTINE_KINDS) },
          },
        }),
        tx.consultationAiState.findUnique({ where: { consultationId: consultation.id } }),
        tx.consultationParticipant.count({
          where: {
            consultationId: consultation.id,
            active: true,
            authorized: false,
            role: { not: 'profissional' },
          },
        }),
        tx.consultationConsent.findFirst({
          where: { consultationId: consultation.id, type: 'transcricao_ia' },
          orderBy: { recordedAt: 'desc' },
        }),
      ])
      if (!liveConsultation) throw new DocumentConfirmationConflictError('Consulta nao encontrada')
      const liveStatus = normalizeConsultationStatus(liveConsultation.status)
      if (liveStatus !== CONSULTATION_STATUS.IN_PROGRESS && liveStatus !== CONSULTATION_STATUS.FINISHED) {
        throw new DocumentConfirmationConflictError('O estado da consulta mudou; recarregue antes de confirmar')
      }
      if (liveStatus === CONSULTATION_STATUS.FINISHED && !req.body?.reason?.trim()) {
        throw new DocumentConfirmationConflictError('Informe o motivo da confirmacao apos a finalizacao')
      }
      if (blockingItems > 0) {
        throw new FinalizationBlockedError(`Revise ${blockingItems} item(ns) critico(s) antes de confirmar`)
      }
      if (document.source === 'ia' && (unauthorizedParticipants > 0 || latestAiConsent?.granted !== true)) {
        throw new FinalizationBlockedError(
          'Confirme os consentimentos de IA e de todos os participantes antes de confirmar a evolucao'
        )
      }
      if (aiState?.processingThroughSequence != null) {
        throw new DocumentConfirmationConflictError('A reconciliacao da IA ainda esta em andamento')
      }

      const transitioned = await tx.generatedClinicalDocument.updateMany({
        where: { id: document.id, consultationId: consultation.id, status: 'rascunho', deletedAt: null },
        data: {
          status: 'confirmado',
          contentJson,
          reviewedAt: new Date(),
          reviewedBy: req.authUser!.id,
          amendmentReason: liveStatus === CONSULTATION_STATUS.FINISHED
            ? req.body?.reason?.trim()
            : document.amendmentReason,
        },
      })
      if (transitioned.count !== 1) {
        throw new DocumentConfirmationConflictError('O documento ja foi confirmado ou alterado em outra sessao')
      }
      if (document.documentKind === 'compartilhavel' && liveStatus === CONSULTATION_STATUS.IN_PROGRESS) {
        const finished = await tx.consultation.updateMany({
          where: { id: consultation.id, status: liveConsultation.status },
          data: {
            status: CONSULTATION_STATUS.FINISHED,
            startedAt: liveConsultation.startedAt || new Date(),
            finishedAt: new Date(),
          },
        })
        if (finished.count !== 1) {
          throw new DocumentConfirmationConflictError('A consulta mudou durante a confirmacao')
        }
      }
      return tx.generatedClinicalDocument.findUniqueOrThrow({ where: { id: document.id } })
    })
    return reply.send({ ...withoutSourceSnapshot(updated), contentJson: JSON.stringify(content) })
  } catch (error) {
    if (error instanceof DocumentConfirmationConflictError || error instanceof FinalizationBlockedError) {
      return reply.status(409).send({ error: error.message })
    }
    throw error
  }
}

export async function resolveDynamicQuarantine(
  req: FastifyRequest<{
    Params: { id: string; itemId: string }
    Body: {
      action?: 'dismiss' | 'restore'
      fieldId?: string
      documentKind?: 'compartilhavel' | 'restrito'
      value?: unknown
    }
  }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  const item = consultation.quarantineItems.find((candidate) => candidate.id === req.params.itemId)
  if (!item) return reply.status(404).send({ error: 'Item de revisao nao encontrado' })
  if (item.status !== 'pendente') return reply.status(409).send({ error: 'Item ja foi revisado' })
  const action = req.body?.action
  if (action !== 'dismiss' && action !== 'restore') return reply.status(400).send({ error: 'Acao de revisao invalida' })

  if (action === 'restore') {
    if (!req.body?.fieldId || !req.body?.documentKind || req.body.value === undefined) {
      return reply.status(400).send({ error: 'Informe campo, documento e valor para restaurar' })
    }
    try {
      await applyManualChanges({
        consultation,
        documentKind: req.body.documentKind,
        changes: [{ fieldId: req.body.fieldId, value: req.body.value }],
        actorUserId: req.authUser!.id,
        reason: 'Restaurado da quarentena apos revisao profissional',
      })
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Nao foi possivel restaurar' })
    }
  }
  const updated = await getPrisma().consultationQuarantineItem.update({
    where: { id: item.id },
    data: {
      status: action === 'restore' ? 'restaurado' : 'descartado',
      resolvedBy: req.authUser!.id,
      resolvedAt: new Date(),
    },
  })
  return reply.send(updated)
}

export async function getMedicationReference(
  req: FastifyRequest<{ Params: { id: string }; Body: { name?: string } }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (consultation.formMode !== 'dynamic') return reply.status(409).send({ error: 'Consulta utiliza o prontuario legado' })
  if (documentWasDeleted(consultation, 'compartilhavel')) {
    return reply.status(410).send({ error: 'O prontuario compartilhavel foi excluido pela politica de retencao' })
  }
  const name = req.body?.name?.trim()
  if (!name) return reply.status(400).send({ error: 'Informe o nome do medicamento' })
  try {
    const result = await findMedicationReference(name, req.authUser!.id)
    const record = await getPrisma().medicationReferenceRecord.create({
      data: {
        consultationId: consultation.id,
        searchedName: result.searchedName,
        normalizedName: result.normalizedName,
        sourceTitle: result.sourceTitle,
        sourceUrl: result.sourceUrl,
        contentJson: JSON.stringify(result),
        status: result.found ? 'pendente' : 'sem_fonte_oficial',
        consultedAt: new Date(result.consultedAt),
      },
    })
    return reply.send({ ...result, recordId: record.id, status: record.status })
  } catch (error) {
    return reply.status(502).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel consultar a fonte da Anvisa',
    })
  }
}

export async function reviewMedicationReference(
  req: FastifyRequest<{
    Params: { id: string; referenceId: string }
    Body: { action?: 'accept' | 'dismiss' }
  }>,
  reply: FastifyReply
) {
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (documentWasDeleted(consultation, 'compartilhavel')) {
    return reply.status(410).send({ error: 'O prontuario compartilhavel foi excluido pela politica de retencao' })
  }
  const reference = consultation.medicationReferences.find((item) => item.id === req.params.referenceId)
  if (!reference) return reply.status(404).send({ error: 'Referencia farmacologica nao encontrada' })
  const action = req.body?.action
  if (action !== 'accept' && action !== 'dismiss') {
    return reply.status(400).send({ error: 'Acao de revisao invalida' })
  }
  if (action === 'accept' && (!reference.sourceUrl || reference.status === 'sem_fonte_oficial')) {
    return reply.status(409).send({ error: 'Uma referencia sem fonte oficial nao pode ser aceita' })
  }
  const updated = await getPrisma().medicationReferenceRecord.update({
    where: { id: reference.id },
    data: {
      status: action === 'accept' ? 'aceito' : 'descartado',
      reviewedAt: new Date(),
      reviewedBy: req.authUser!.id,
    },
  })
  return reply.send({ ...updated, content: parseJson(updated.contentJson, {}), contentJson: undefined })
}

export async function createDynamicTranscriptVersion(
  req: FastifyRequest<{
    Params: { id: string }
    Body: { newTranscript?: string; reason?: string; editDiff?: { before: string; after: string } }
  }>,
  reply: FastifyReply
) {
  const newTranscript = req.body?.newTranscript?.trim() || ''
  if (!newTranscript) return reply.status(400).send({ error: 'Transcricao editada nao pode ser vazia' })
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  if (consultation.formMode !== 'dynamic') {
    return reply.status(409).send({ error: 'Consulta utiliza o prontuario legado' })
  }
  if (documentWasDeleted(consultation)) {
    return reply.status(410).send({ error: 'A consulta teve conteudo excluido e nao aceita nova transcricao' })
  }
  if (newTranscript.length > 500_000) {
    return reply.status(400).send({ error: 'A transcricao excede o limite permitido' })
  }
  if (normalizeConsultationStatus(consultation.status) === CONSULTATION_STATUS.FINISHED && !req.body?.reason?.trim()) {
    return reply.status(400).send({ error: 'Informe o motivo da correcao apos a finalizacao' })
  }
  if (req.body?.reason && req.body.reason.length > 2_000) {
    return reply.status(400).send({ error: 'O motivo da correcao excede o limite permitido' })
  }

  // A edicao substitui os segmentos e invalida IDs, tempos e atribuicoes de
  // falante anteriores. Valores manuais permanecem; valores exclusivamente da
  // IA voltam para revisao ate uma nova diarizacao/confirmacao de evidencias.
  const aiValuesToInvalidate = consultation.documents.flatMap((document) =>
    document.fieldValues
      .filter((field) => field.source === 'ia')
      .map((field) => ({ document, field }))
  )

  const prisma = getPrisma()
  const savedVersion = await prisma.$transaction(async (tx) => {
    const aggregate = await tx.consultationVersion.aggregate({
      where: { consultationId: consultation.id },
      _max: { version: true },
    })
    const version = (aggregate._max.version || 0) + 1
    await tx.consultationVersion.create({
      data: {
        consultationId: consultation.id,
        version,
        snapshot: JSON.stringify({
          formTemplateVersionId: consultation.formTemplateVersionId,
          formDefinitionSnapshot: consultation.formDefinitionSnapshot,
          documents: consultation.documents,
          generatedDocuments: consultation.generatedDocuments,
          participants: consultation.participants,
          quarantineItems: consultation.quarantineItems,
        }),
        transcript: consultation.transcript,
        reason: req.body?.reason?.trim() || 'Correcao da transcricao dinamica',
        editDiff: JSON.stringify({ before: consultation.transcript || '', after: newTranscript }),
      },
    })

    for (const { document, field } of aiValuesToInvalidate) {
      await tx.consultationFieldEvent.create({
        data: {
          consultationId: consultation.id,
          fieldValueId: field.id,
          documentKind: document.kind,
          fieldId: field.fieldId,
          operation: 'remover_ia_evidencia_invalidada',
          previousValueJson: field.valueJson,
          nextValueJson: null,
          actorType: 'sistema',
          actorUserId: req.authUser!.id,
          metadataJson: protectJson(
            { reason: 'A edicao invalidou segmento, tempo e atribuicao de falante da evidencia anterior' },
            document.kind
          ),
        },
      })
      await tx.consultationQuarantineItem.create({
        data: {
          consultationId: consultation.id,
          kind: 'evidencia_invalidada',
          reason: 'Valor da IA removido apos edicao da transcricao; restaure somente apos revisao profissional.',
          payloadJson: protectSensitiveText(JSON.stringify({
            documentKind: document.kind,
            fieldId: field.fieldId,
            value: unprotectJson(field.valueJson, document.kind),
            evidence: field.evidenceJson
              ? unprotectJson(field.evidenceJson, document.kind)
              : [],
          })),
        },
      })
      await tx.consultationFieldValue.delete({ where: { id: field.id } })
    }

    await tx.consultationTranscriptSegment.deleteMany({ where: { consultationId: consultation.id } })
    await tx.consultationTranscriptSegment.create({
      data: {
        consultationId: consultation.id,
        itemId: `transcript-edit-${version}`,
        sequence: 1,
        text: newTranscript,
        source: 'edicao_profissional',
        kind: 'transcricao_corrigida',
        payload: JSON.stringify({ requiresSpeakerRemapping: true }),
      },
    })
    await tx.consultation.update({
      where: { id: consultation.id },
      data: { transcript: newTranscript, transcriptStructured: null },
    })
    await tx.consultationAiState.updateMany({
      where: { consultationId: consultation.id },
      data: {
        lastProcessedSequence: 0,
        processingThroughSequence: null,
        processingStartedAt: null,
        finalReviewAt: null,
      },
    })
    await tx.consultationQuarantineItem.create({
      data: {
        consultationId: consultation.id,
        kind: 'remapeamento_vozes',
        reason: 'A transcricao foi corrigida; confirme novamente a atribuicao das vozes antes de usar a IA.',
        sourceText: null,
      },
    })
    return version
  })

  const refreshed = await findOwnedConsultation(consultation.id, req.authUser!.id)
  if (!refreshed) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  const definition = definitionForConsultation(refreshed)
  return reply.send({
    savedVersion,
    removedAiFieldIds: aiValuesToInvalidate.map(({ field }) => field.fieldId),
    requiresSpeakerRemapping: true,
    runtime: runtimePayload(refreshed, definition, manifestForConsultation(refreshed, definition)),
  })
}

export async function exportDynamicDocument(
  req: FastifyRequest<{ Params: { id: string; kind: 'compartilhavel' | 'restrito' } }>,
  reply: FastifyReply
) {
  if (!dynamicFormsEnabled()) return reply.status(404).send({ error: 'Formularios dinamicos estao desativados' })
  const consultation = await findOwnedConsultation(req.params.id, req.authUser!.id)
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  const kind = req.params.kind
  if (kind !== 'compartilhavel' && kind !== 'restrito') return reply.status(400).send({ error: 'Documento invalido' })
  if (documentWasDeleted(consultation, kind)) {
    return reply.status(410).send({ error: 'O documento solicitado foi excluido pela politica de retencao' })
  }
  const definition = definitionForConsultation(consultation)
  const documentDefinition = definition.documents.find((item) => item.kind === kind)
  const document = consultation.documents.find((item) => item.kind === kind)
  if (!document || document.deletedAt) {
    return reply.status(410).send({ error: 'O documento nao esta mais disponivel pela politica de retencao' })
  }
  const allowedFieldIds = new Set(
    buildRuntimeManifest(definition).documents
      .find((item) => item.kind === kind)?.fields.map((field) => field.id) || []
  )
  const values = Object.fromEntries((document?.fieldValues || [])
    .filter((field) => allowedFieldIds.has(field.fieldId))
    .map((field) => [
    field.fieldId,
    unprotectJson(field.valueJson, kind),
    ]))
  const generatedDocuments = consultation.generatedDocuments
    .filter((item) => item.documentKind === kind && item.status === 'confirmado')
    .map((item) => ({
      format: item.format,
      source: item.source,
      createdBy: item.createdBy,
      content: parseJson(
        kind === 'restrito' ? revealSensitiveText(item.contentJson) : item.contentJson,
        {}
      ),
      reviewedAt: item.reviewedAt,
      reviewedBy: item.reviewedBy,
    }))
  const payload = {
    exportedAt: new Date().toISOString(),
    betaWarning: 'Beta experimental nao homologado para uso clinico real.',
    patient: { id: consultation.patient.id, name: consultation.patient.name },
    consultation: {
      id: consultation.id,
      scheduledAt: consultation.scheduledAt,
      startedAt: consultation.startedAt,
      finishedAt: consultation.finishedAt,
    },
    document: documentDefinition,
    values,
    generatedDocuments,
  }
  const filename = `consulta-${consultation.id}-${kind}.json`
  await recordSensitiveAccess({
    actorUserId: req.authUser!.id,
    consultationId: consultation.id,
    dataClass: kind === 'restrito' ? 'registro_psicologico_restrito' : 'prontuario_compartilhavel',
    action: 'exportar_documento',
    requestId: req.id,
  })
  return reply
    .header('Cache-Control', 'no-store')
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .type('application/json; charset=utf-8')
    .send(payload)
}
