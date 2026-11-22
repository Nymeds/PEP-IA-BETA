import { createHash } from 'crypto'
import { getPrisma } from '../lib/prisma'
import { PSYCHOLOGY_FORM_PRESET, PSYCHOLOGY_PRESET_KEY } from '../presets/psychology-form.preset'
import { GENERAL_CLINIC_FORM_PRESET, GENERAL_CLINIC_PRESET_KEY } from '../presets/general-clinic-form.preset'
import {
  buildRuntimeManifest,
  ClinicalFormDefinition,
  parseDraftFormDefinition,
  parseFormDefinition,
} from './clinical-forms.service'

export const PSYCHOLOGY_SPECIALTY_CODE = 'psicologia'
export const GENERAL_CLINIC_SPECIALTY_CODE = 'clinica_geral'

const BASE_SPECIALTIES = [
  {
    code: PSYCHOLOGY_SPECIALTY_CODE,
    name: 'Psicologia',
    description: 'Atendimento psicologico com prontuario compartilhavel e registro restrito.',
    preset: PSYCHOLOGY_FORM_PRESET,
    presetKey: PSYCHOLOGY_PRESET_KEY,
    templateDescription: 'Preset inicial completo e editavel para atendimentos de Psicologia.',
  },
  {
    code: GENERAL_CLINIC_SPECIALTY_CODE,
    name: 'Clínica Geral',
    description: 'Atendimento médico geral com anamnese, exame, diagnóstico e conduta.',
    preset: GENERAL_CLINIC_FORM_PRESET,
    presetKey: GENERAL_CLINIC_PRESET_KEY,
    templateDescription: 'Preset inicial completo e editável para atendimentos de Clínica Geral.',
  },
] as const

export class FormTemplateRevisionConflictError extends Error {}

export class ScheduleFormConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScheduleFormConfigurationError'
  }
}

export class FormTemplateArchiveConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormTemplateArchiveConflictError'
  }
}

function checksum(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function withTemplateName(definition: ClinicalFormDefinition, name: string): ClinicalFormDefinition {
  return parseDraftFormDefinition({
    ...definition,
    name,
  })
}

function parseStoredJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export async function ensureBaseSpecialties() {
  return Promise.all(BASE_SPECIALTIES.map((specialty) => getPrisma().specialtyProfile.upsert({
    where: { code: specialty.code },
    update: {
      name: specialty.name,
      description: specialty.description,
      dynamicFormsEnabled: true,
    },
    create: {
      code: specialty.code,
      name: specialty.name,
      description: specialty.description,
      dynamicFormsEnabled: true,
    },
  })))
}

export async function ensureSpecialtyProfile(code: string, name: string) {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(code)) {
    throw new Error('Codigo de especialidade invalido')
  }
  const baseSpecialty = BASE_SPECIALTIES.find((item) => item.code === code)
  if (baseSpecialty) {
    await ensureBaseSpecialties()
    return getPrisma().specialtyProfile.findUniqueOrThrow({ where: { code } })
  }

  return getPrisma().specialtyProfile.upsert({
    where: { code },
    update: { name, dynamicFormsEnabled: true },
    create: {
      code,
      name,
      description: `Especialidade clínica cadastrada para ${name}.`,
      dynamicFormsEnabled: true,
    },
  })
}

export async function ensureBaseFormTemplatesForUser(userId: string) {
  await ensureBaseSpecialties()
  const prisma = getPrisma()
  const templates = []

  for (const base of BASE_SPECIALTIES) {
    const definitionJson = JSON.stringify(base.preset)
    const runtimeManifestJson = JSON.stringify(buildRuntimeManifest(base.preset))
    const template = await prisma.clinicalFormTemplate.upsert({
      where: { userId_sourceTemplateKey: { userId, sourceTemplateKey: base.presetKey } },
      update: {},
      create: {
        userId,
        specialtyCode: base.code,
        name: base.preset.name,
        description: base.templateDescription,
        status: 'publicado',
        origin: 'preset_sistema',
        sourceTemplateKey: base.presetKey,
        draftDefinitionJson: definitionJson,
        versions: {
          create: {
            version: 1,
            definitionJson,
            runtimeManifestJson,
            checksum: checksum(definitionJson),
          },
        },
      },
    })
    await prisma.clinicalFormDefault.upsert({
      where: { userId_specialtyCode: { userId, specialtyCode: base.code } },
      update: {},
      create: { userId, specialtyCode: base.code, templateId: template.id },
    })
    await prisma.schedule.updateMany({
      where: { userId, specialtyCode: base.code, formTemplateId: null },
      data: { formTemplateId: template.id },
    })
    templates.push(template)
  }

  await prisma.audioRetentionPolicy.upsert({
    where: { userId },
    update: {},
    create: { userId },
  })

  return templates
}

function inferBaseSpecialtyCode(name?: string | null) {
  const normalized = (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
  if (normalized.includes('psicolog')) return PSYCHOLOGY_SPECIALTY_CODE
  return GENERAL_CLINIC_SPECIALTY_CODE
}

/**
 * Migra metadados antigos para o motor unico sem apagar as colunas historicas.
 * O snapshot em ConsultationVersion preserva o estado anterior para auditoria.
 */
export async function migrateOwnedRecordsToDynamic(userId: string) {
  const templates = await ensureBaseFormTemplatesForUser(userId)
  if (!templates.length) return { schedules: 0, consultations: 0 }
  const prisma = getPrisma()
  const versionBySpecialty = new Map<string, {
    templateId: string
    versionId: string
    definitionJson: string
  }>()
  for (const template of templates) {
    const version = await prisma.clinicalFormTemplateVersion.findFirst({
      where: { templateId: template.id },
      orderBy: { version: 'desc' },
    })
    if (version) {
      versionBySpecialty.set(template.specialtyCode, {
        templateId: template.id,
        versionId: version.id,
        definitionJson: version.definitionJson,
      })
    }
  }

  let migratedSchedules = 0
  const schedules = await prisma.schedule.findMany({ where: { userId } })
  for (const schedule of schedules) {
    const specialtyCode = schedule.specialtyCode || inferBaseSpecialtyCode(schedule.specialty)
    const target = versionBySpecialty.get(specialtyCode)
    if (!target) continue
    if (schedule.specialtyCode === specialtyCode && schedule.formTemplateId === target.templateId) continue
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { specialtyCode, formTemplateId: target.templateId },
    })
    migratedSchedules += 1
  }

  let migratedConsultations = 0
  const consultations = await prisma.consultation.findMany({
    where: {
      userId,
      OR: [{ formMode: { not: 'dynamic' } }, { formTemplateVersionId: null }],
    },
    include: { schedule: true },
  })
  for (const consultation of consultations) {
    const specialtyCode = consultation.specialtyCode ||
      consultation.schedule?.specialtyCode ||
      inferBaseSpecialtyCode(consultation.schedule?.specialty)
    const target = versionBySpecialty.get(specialtyCode)
    if (!target) continue
    await prisma.$transaction(async (tx) => {
      const versionNumber = await tx.consultationVersion.count({
        where: { consultationId: consultation.id },
      })
      await tx.consultationVersion.create({
        data: {
          consultationId: consultation.id,
          version: versionNumber + 1,
          snapshot: JSON.stringify(consultation),
          transcript: consultation.transcript,
          reason: 'Migracao do prontuario fixo para formulario versionado',
        },
      })
      await tx.consultation.update({
        where: { id: consultation.id },
        data: {
          formMode: 'dynamic',
          specialtyCode,
          formTemplateVersionId: target.versionId,
          formDefinitionSnapshot: target.definitionJson,
          formPinnedAt: new Date(),
        },
      })
    })
    migratedConsultations += 1
  }
  return { schedules: migratedSchedules, consultations: migratedConsultations }
}

interface TemplateRecordForDto {
  id: string
  name: string
  description: string | null
  specialtyCode: string
  status: string
  origin: string
  draftDefinitionJson: string
  createdAt: Date
  updatedAt: Date
  archivedAt: Date | null
  versions: Array<{
    id: string
    version: number
    checksum: string
    publishedAt: Date
    createdAt: Date
    definitionJson?: string
    runtimeManifestJson?: string
  }>
  defaults: Array<{ id: string }>
  _count: { schedules: number }
}

export function serializeFormTemplate(record: TemplateRecordForDto) {
  const latestVersion = record.versions[0] || null
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    specialtyCode: record.specialtyCode,
    status: record.status,
    origin: record.origin,
    isDefault: record.defaults.length > 0,
    linkedScheduleCount: record._count.schedules,
    draftDefinition: parseStoredJson(record.draftDefinitionJson, null),
    latestVersion: latestVersion
      ? {
          id: latestVersion.id,
          version: latestVersion.version,
          checksum: latestVersion.checksum,
          publishedAt: latestVersion.publishedAt,
        }
      : null,
    hasUnpublishedChanges:
      !latestVersion || checksum(record.draftDefinitionJson) !== latestVersion.checksum,
    versionCount: record.versions.length,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export function serializeFormTemplateVersion(record: {
  id: string
  templateId: string
  version: number
  definitionJson: string
  runtimeManifestJson: string
  checksum: string
  publishedAt: Date
  createdAt: Date
}) {
  return {
    id: record.id,
    templateId: record.templateId,
    version: record.version,
    definition: parseStoredJson(record.definitionJson, null),
    runtimeManifest: parseStoredJson(record.runtimeManifestJson, null),
    checksum: record.checksum,
    publishedAt: record.publishedAt,
    createdAt: record.createdAt,
  }
}

const templateInclude = (userId: string) => ({
  versions: { orderBy: { version: 'desc' as const } },
  defaults: { where: { userId }, select: { id: true } },
  _count: { select: { schedules: true } },
})

export async function listOwnedFormTemplates(
  userId: string,
  filters?: { specialtyCode?: string; status?: string }
) {
  await ensureBaseFormTemplatesForUser(userId)
  return getPrisma().clinicalFormTemplate.findMany({
    where: {
      userId,
      ...(filters?.specialtyCode ? { specialtyCode: filters.specialtyCode } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    include: templateInclude(userId),
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  })
}

export async function getOwnedFormTemplate(userId: string, templateId: string) {
  return getPrisma().clinicalFormTemplate.findFirst({
    where: { id: templateId, userId },
    include: templateInclude(userId),
  })
}

export async function createOwnedFormTemplate(input: {
  userId: string
  name: string
  specialtyCode: string
  description?: string
  definition?: unknown
}) {
  const specialtyCode = input.specialtyCode.trim().toLowerCase()
  await ensureBaseFormTemplatesForUser(input.userId)
  await ensureSpecialtyProfile(
    specialtyCode,
    specialtyCode.split(/[_-]+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
  )

  const baseDefinition = BASE_SPECIALTIES.find((item) => item.code === specialtyCode)?.preset || {
    ...GENERAL_CLINIC_FORM_PRESET,
    specialtyCode,
  }
  const definition = input.definition
    ? parseDraftFormDefinition(input.definition)
    : withTemplateName(baseDefinition, input.name)
  if (definition.specialtyCode !== specialtyCode) {
    throw new Error('A especialidade da definicao difere da especialidade do formulario')
  }

  return getPrisma().clinicalFormTemplate.create({
    data: {
      userId: input.userId,
      specialtyCode,
      name: input.name,
      description: input.description || null,
      status: 'rascunho',
      origin: 'usuario',
      draftDefinitionJson: JSON.stringify(withTemplateName(definition, input.name)),
    },
    include: templateInclude(input.userId),
  })
}

export async function updateOwnedFormTemplate(input: {
  userId: string
  templateId: string
  name?: string
  description?: string | null
  draftDefinition?: unknown
  expectedUpdatedAt?: Date
}) {
  const existing = await getOwnedFormTemplate(input.userId, input.templateId)
  if (!existing) return null
  if (existing.status === 'arquivado') throw new Error('Formularios arquivados nao podem ser editados')

  const nextName = input.name?.trim() || existing.name
  const definition = input.draftDefinition === undefined
    ? parseDraftFormDefinition(existing.draftDefinitionJson)
    : parseDraftFormDefinition(input.draftDefinition)

  if (definition.specialtyCode !== existing.specialtyCode) {
    throw new Error('A especialidade da definicao nao pode ser alterada')
  }

  const prisma = getPrisma()
  const updated = await prisma.clinicalFormTemplate.updateMany({
    where: {
      id: existing.id,
      userId: input.userId,
      status: { not: 'arquivado' },
      ...(input.expectedUpdatedAt ? { updatedAt: input.expectedUpdatedAt } : {}),
    },
    data: {
      name: nextName,
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      draftDefinitionJson: JSON.stringify(withTemplateName(definition, nextName)),
    },
  })
  if (updated.count !== 1) {
    throw new FormTemplateRevisionConflictError(
      'O formulario foi alterado em outra aba. Recarregue antes de continuar.'
    )
  }
  return getOwnedFormTemplate(input.userId, existing.id)
}

export async function publishOwnedFormTemplate(userId: string, templateId: string) {
  const existing = await getOwnedFormTemplate(userId, templateId)
  if (!existing) return null
  if (existing.status === 'arquivado') throw new Error('Formularios arquivados nao podem ser publicados')

  const definition = parseFormDefinition(existing.draftDefinitionJson)
  const definitionJson = JSON.stringify(definition)
  const runtimeManifestJson = JSON.stringify(buildRuntimeManifest(definition))

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await getPrisma().$transaction(async (tx) => {
        const latest = await tx.clinicalFormTemplateVersion.findFirst({
          where: { templateId: existing.id },
          orderBy: { version: 'desc' },
          select: { version: true },
        })
        const created = await tx.clinicalFormTemplateVersion.create({
          data: {
            templateId: existing.id,
            version: (latest?.version || 0) + 1,
            definitionJson,
            runtimeManifestJson,
            checksum: checksum(definitionJson),
          },
        })
        await tx.clinicalFormTemplate.update({
          where: { id: existing.id },
          data: { status: 'publicado', archivedAt: null },
        })
        await tx.clinicalFormDefault.upsert({
          where: { userId_specialtyCode: { userId, specialtyCode: existing.specialtyCode } },
          update: {},
          create: { userId, specialtyCode: existing.specialtyCode, templateId: existing.id },
        })
        return created
      })
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: unknown }).code)
        : ''
      if ((code === 'P2002' || code === 'P2034') && attempt < 3) continue
      throw error
    }
  }
  throw new Error('Nao foi possivel numerar a nova versao do formulario')
}

export async function copyOwnedFormTemplate(userId: string, templateId: string, requestedName?: string) {
  const existing = await getOwnedFormTemplate(userId, templateId)
  if (!existing) return null
  const name = requestedName?.trim() || `${existing.name} (copia)`
  const definition = withTemplateName(parseDraftFormDefinition(existing.draftDefinitionJson), name)

  return getPrisma().clinicalFormTemplate.create({
    data: {
      userId,
      specialtyCode: existing.specialtyCode,
      name,
      description: existing.description,
      status: 'rascunho',
      origin: 'copia',
      draftDefinitionJson: JSON.stringify(definition),
    },
    include: templateInclude(userId),
  })
}

export async function setOwnedDefaultFormTemplate(userId: string, templateId: string) {
  const existing = await getOwnedFormTemplate(userId, templateId)
  if (!existing) return null
  if (existing.status !== 'publicado' || existing.versions.length === 0) {
    throw new Error('Publique o formulario antes de defini-lo como padrao')
  }

  await getPrisma().clinicalFormDefault.upsert({
    where: { userId_specialtyCode: { userId, specialtyCode: existing.specialtyCode } },
    update: { templateId: existing.id },
    create: { userId, specialtyCode: existing.specialtyCode, templateId: existing.id },
  })
  return getOwnedFormTemplate(userId, templateId)
}

export async function archiveOwnedFormTemplate(userId: string, templateId: string) {
  const existing = await getOwnedFormTemplate(userId, templateId)
  if (!existing) return null
  const isDefault = existing.defaults.length > 0
  const linkedScheduleCount = existing._count.schedules
  if (isDefault && linkedScheduleCount > 0) {
    const agendas = linkedScheduleCount === 1
      ? 'a agenda vinculada'
      : `as ${linkedScheduleCount} agendas vinculadas`
    throw new FormTemplateArchiveConflictError(
      `Defina outro formulário padrão e reassocie ${agendas} antes de arquivar este formulário`
    )
  }
  if (isDefault) {
    throw new FormTemplateArchiveConflictError(
      'Defina outro formulário padrão antes de arquivar este formulário'
    )
  }
  if (linkedScheduleCount > 0) {
    const agendas = linkedScheduleCount === 1
      ? 'a agenda vinculada'
      : `as ${linkedScheduleCount} agendas vinculadas`
    throw new FormTemplateArchiveConflictError(
      `Reassocie ${agendas} antes de arquivar este formulário`
    )
  }

  return getPrisma().clinicalFormTemplate.update({
    where: { id: existing.id },
    data: { status: 'arquivado', archivedAt: new Date() },
    include: templateInclude(userId),
  })
}

export async function listOwnedFormTemplateVersions(userId: string, templateId: string) {
  const existing = await getOwnedFormTemplate(userId, templateId)
  if (!existing) return null
  return getPrisma().clinicalFormTemplateVersion.findMany({
    where: { templateId: existing.id },
    orderBy: { version: 'desc' },
  })
}

export async function resolveScheduleTemplate(input: {
  userId: string
  specialtyCode?: string | null
  formTemplateId?: string | null
}) {
  if (!input.specialtyCode) {
    return null
  }

  await ensureBaseFormTemplatesForUser(input.userId)
  if (input.formTemplateId) {
    const selected = await getOwnedFormTemplate(input.userId, input.formTemplateId)
    if (!selected || selected.specialtyCode !== input.specialtyCode || selected.status !== 'publicado') {
      throw new ScheduleFormConfigurationError(
        'Selecione um formulario publicado da especialidade desta agenda'
      )
    }
    return selected
  }

  const defaultRecord = await getPrisma().clinicalFormDefault.findUnique({
    where: {
      userId_specialtyCode: {
        userId: input.userId,
        specialtyCode: input.specialtyCode,
      },
    },
    include: { template: { include: templateInclude(input.userId) } },
  })
  if (!defaultRecord?.template || defaultRecord.template.status !== 'publicado') {
    throw new ScheduleFormConfigurationError(
      'Defina um formulario publicado como padrao para esta especialidade'
    )
  }
  return defaultRecord.template
}

export async function resolvePublishedVersionForSchedule(input: {
  userId: string
  specialtyCode?: string | null
  formTemplateId?: string | null
}) {
  const template = await resolveScheduleTemplate(input)
  if (!template) return null
  const version = template.versions[0]
  if (!version) {
    throw new ScheduleFormConfigurationError(
      'O formulario selecionado ainda nao possui versao publicada'
    )
  }
  return { template, version }
}
