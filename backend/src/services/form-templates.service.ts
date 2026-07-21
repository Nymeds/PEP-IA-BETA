import { createHash } from 'crypto'
import { getPrisma } from '../lib/prisma'
import { PSYCHOLOGY_FORM_PRESET, PSYCHOLOGY_PRESET_KEY } from '../presets/psychology-form.preset'
import {
  buildRuntimeManifest,
  ClinicalFormDefinition,
  parseDraftFormDefinition,
  parseFormDefinition,
} from './clinical-forms.service'

export const PSYCHOLOGY_SPECIALTY_CODE = 'psicologia'

export class FormTemplateRevisionConflictError extends Error {}

export function isDynamicPsychologyEnabled(): boolean {
  return process.env.DYNAMIC_FORMS_PSYCHOLOGY !== 'false'
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

export async function ensurePsychologySpecialty() {
  return getPrisma().specialtyProfile.upsert({
    where: { code: PSYCHOLOGY_SPECIALTY_CODE },
    update: {
      name: 'Psicologia',
      description: 'Atendimento psicologico com prontuario compartilhavel e registro restrito.',
      dynamicFormsEnabled: isDynamicPsychologyEnabled(),
    },
    create: {
      code: PSYCHOLOGY_SPECIALTY_CODE,
      name: 'Psicologia',
      description: 'Atendimento psicologico com prontuario compartilhavel e registro restrito.',
      dynamicFormsEnabled: isDynamicPsychologyEnabled(),
    },
  })
}

export async function ensureSpecialtyProfile(code: string, name: string) {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(code)) {
    throw new Error('Codigo de especialidade invalido')
  }
  if (code === PSYCHOLOGY_SPECIALTY_CODE) return ensurePsychologySpecialty()

  return getPrisma().specialtyProfile.upsert({
    where: { code },
    update: { name },
    create: {
      code,
      name,
      description: `Especialidade legada: ${name}.`,
      dynamicFormsEnabled: false,
    },
  })
}

export async function ensurePsychologyTemplateForUser(userId: string) {
  if (!isDynamicPsychologyEnabled()) return null

  await ensurePsychologySpecialty()
  const definitionJson = JSON.stringify(PSYCHOLOGY_FORM_PRESET)
  const runtimeManifestJson = JSON.stringify(buildRuntimeManifest(PSYCHOLOGY_FORM_PRESET))
  const prisma = getPrisma()

  const template = await prisma.clinicalFormTemplate.upsert({
    where: {
      userId_sourceTemplateKey: {
        userId,
        sourceTemplateKey: PSYCHOLOGY_PRESET_KEY,
      },
    },
    update: {},
    create: {
      userId,
      specialtyCode: PSYCHOLOGY_SPECIALTY_CODE,
      name: PSYCHOLOGY_FORM_PRESET.name,
      description: 'Preset inicial completo e editavel para atendimentos de Psicologia.',
      status: 'publicado',
      origin: 'preset_sistema',
      sourceTemplateKey: PSYCHOLOGY_PRESET_KEY,
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
    where: {
      userId_specialtyCode: {
        userId,
        specialtyCode: PSYCHOLOGY_SPECIALTY_CODE,
      },
    },
    update: {},
    create: {
      userId,
      specialtyCode: PSYCHOLOGY_SPECIALTY_CODE,
      templateId: template.id,
    },
  })

  await prisma.audioRetentionPolicy.upsert({
    where: { userId },
    update: {},
    create: { userId },
  })

  return template
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
})

export async function listOwnedFormTemplates(
  userId: string,
  filters?: { specialtyCode?: string; status?: string }
) {
  await ensurePsychologyTemplateForUser(userId)
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
  if (specialtyCode === PSYCHOLOGY_SPECIALTY_CODE) {
    await ensurePsychologyTemplateForUser(input.userId)
  }
  const specialty = await getPrisma().specialtyProfile.findUnique({ where: { code: specialtyCode } })
  if (!specialty?.dynamicFormsEnabled) {
    throw new Error('Esta especialidade ainda nao possui formularios dinamicos habilitados')
  }

  const definition = input.definition
    ? parseDraftFormDefinition(input.definition)
    : withTemplateName(PSYCHOLOGY_FORM_PRESET, input.name)
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
  if (existing.defaults.length > 0) {
    throw new Error('Defina outro formulario padrao antes de arquivar este formulario')
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
  if (input.specialtyCode !== PSYCHOLOGY_SPECIALTY_CODE || !isDynamicPsychologyEnabled()) {
    return null
  }

  await ensurePsychologyTemplateForUser(input.userId)
  if (input.formTemplateId) {
    const selected = await getOwnedFormTemplate(input.userId, input.formTemplateId)
    if (!selected || selected.specialtyCode !== input.specialtyCode || selected.status !== 'publicado') {
      throw new Error('Selecione um formulario publicado da especialidade desta agenda')
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
    throw new Error('Defina um formulario publicado como padrao para esta especialidade')
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
  if (!version) throw new Error('O formulario selecionado ainda nao possui versao publicada')
  return { template, version }
}
