import { FastifyReply, FastifyRequest } from 'fastify'
import { ClinicalFormValidationError } from '../services/clinical-forms.service'
import {
  archiveOwnedFormTemplate,
  copyOwnedFormTemplate,
  createOwnedFormTemplate,
  getOwnedFormTemplate,
  listOwnedFormTemplates,
  listOwnedFormTemplateVersions,
  publishOwnedFormTemplate,
  serializeFormTemplate,
  serializeFormTemplateVersion,
  setOwnedDefaultFormTemplate,
  updateOwnedFormTemplate,
  FormTemplateRevisionConflictError,
} from '../services/form-templates.service'

interface TemplateParams {
  id: string
}

interface TemplateListQuery {
  specialtyCode?: string
  status?: string
}

interface CreateTemplateBody {
  name?: string
  description?: string
  specialtyCode?: string
  definition?: unknown
}

interface UpdateTemplateBody {
  name?: string
  description?: string | null
  draftDefinition?: unknown
  expectedUpdatedAt?: string
}

interface CopyTemplateBody {
  name?: string
}

function statusForError(error: unknown): number {
  if (error instanceof FormTemplateRevisionConflictError) return 409
  if (error instanceof ClinicalFormValidationError) return 422
  return 400
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export async function listFormTemplates(
  req: FastifyRequest<{ Querystring: TemplateListQuery }>,
  reply: FastifyReply
) {
  try {
    const status = req.query?.status?.trim()
    if (status && !['rascunho', 'publicado', 'arquivado'].includes(status)) {
      return reply.status(400).send({ error: 'Status de formulario invalido' })
    }
    const specialtyCode = req.query?.specialtyCode?.trim().toLowerCase()
    const templates = await listOwnedFormTemplates(req.authUser!.id, { specialtyCode, status })
    return reply.send({ items: templates.map(serializeFormTemplate) })
  } catch (error) {
    return reply.status(statusForError(error)).send({
      error: errorMessage(error, 'Nao foi possivel listar os formularios'),
    })
  }
}

export async function createFormTemplate(
  req: FastifyRequest<{ Body: CreateTemplateBody }>,
  reply: FastifyReply
) {
  try {
    const name = req.body?.name?.trim() || ''
    const specialtyCode = req.body?.specialtyCode?.trim().toLowerCase() || ''
    if (name.length < 2 || name.length > 120) {
      return reply.status(400).send({ error: 'Informe um nome de formulario entre 2 e 120 caracteres' })
    }
    if (!specialtyCode) {
      return reply.status(400).send({ error: 'Informe a especialidade do formulario' })
    }

    const template = await createOwnedFormTemplate({
      userId: req.authUser!.id,
      name,
      specialtyCode,
      description: req.body?.description?.trim(),
      definition: req.body?.definition,
    })
    return reply.status(201).send({ template: serializeFormTemplate(template) })
  } catch (error) {
    return reply.status(statusForError(error)).send({
      error: errorMessage(error, 'Nao foi possivel criar o formulario'),
    })
  }
}

export async function getFormTemplate(
  req: FastifyRequest<{ Params: TemplateParams }>,
  reply: FastifyReply
) {
  const template = await getOwnedFormTemplate(req.authUser!.id, req.params.id)
  if (!template) return reply.status(404).send({ error: 'Formulario nao encontrado' })
  return reply.send({ template: serializeFormTemplate(template) })
}

export async function updateFormTemplate(
  req: FastifyRequest<{ Params: TemplateParams; Body: UpdateTemplateBody }>,
  reply: FastifyReply
) {
  try {
    if (req.body?.name !== undefined) {
      const name = req.body.name.trim()
      if (name.length < 2 || name.length > 120) {
        return reply.status(400).send({ error: 'Informe um nome entre 2 e 120 caracteres' })
      }
    }
    if (
      req.body?.description !== undefined &&
      req.body.description !== null &&
      req.body.description.length > 1000
    ) {
      return reply.status(400).send({ error: 'A descricao deve ter no maximo 1000 caracteres' })
    }
    const expectedUpdatedAt = req.body?.expectedUpdatedAt
      ? new Date(req.body.expectedUpdatedAt)
      : undefined
    if (expectedUpdatedAt && Number.isNaN(expectedUpdatedAt.getTime())) {
      return reply.status(400).send({ error: 'Revisao esperada do formulario invalida' })
    }

    const template = await updateOwnedFormTemplate({
      userId: req.authUser!.id,
      templateId: req.params.id,
      name: req.body?.name,
      description: req.body?.description,
      draftDefinition: req.body?.draftDefinition,
      expectedUpdatedAt,
    })
    if (!template) return reply.status(404).send({ error: 'Formulario nao encontrado' })
    return reply.send({ template: serializeFormTemplate(template) })
  } catch (error) {
    if (error instanceof FormTemplateRevisionConflictError) {
      return reply.status(409).send({
        error: error.message,
        code: 'FORM_TEMPLATE_REVISION_CONFLICT',
      })
    }
    return reply.status(statusForError(error)).send({
      error: errorMessage(error, 'Nao foi possivel salvar o formulario'),
    })
  }
}

export async function publishFormTemplate(
  req: FastifyRequest<{ Params: TemplateParams }>,
  reply: FastifyReply
) {
  try {
    const version = await publishOwnedFormTemplate(req.authUser!.id, req.params.id)
    if (!version) return reply.status(404).send({ error: 'Formulario nao encontrado' })
    const template = await getOwnedFormTemplate(req.authUser!.id, req.params.id)
    return reply.status(201).send({
      template: template ? serializeFormTemplate(template) : null,
      version: serializeFormTemplateVersion(version),
    })
  } catch (error) {
    return reply.status(statusForError(error)).send({
      error: errorMessage(error, 'Nao foi possivel publicar o formulario'),
    })
  }
}

export async function copyFormTemplate(
  req: FastifyRequest<{ Params: TemplateParams; Body: CopyTemplateBody }>,
  reply: FastifyReply
) {
  try {
    const template = await copyOwnedFormTemplate(req.authUser!.id, req.params.id, req.body?.name)
    if (!template) return reply.status(404).send({ error: 'Formulario nao encontrado' })
    return reply.status(201).send({ template: serializeFormTemplate(template) })
  } catch (error) {
    return reply.status(statusForError(error)).send({
      error: errorMessage(error, 'Nao foi possivel copiar o formulario'),
    })
  }
}

export async function setDefaultFormTemplate(
  req: FastifyRequest<{ Params: TemplateParams }>,
  reply: FastifyReply
) {
  try {
    const template = await setOwnedDefaultFormTemplate(req.authUser!.id, req.params.id)
    if (!template) return reply.status(404).send({ error: 'Formulario nao encontrado' })
    return reply.send({ template: serializeFormTemplate(template) })
  } catch (error) {
    return reply.status(statusForError(error)).send({
      error: errorMessage(error, 'Nao foi possivel definir o formulario padrao'),
    })
  }
}

export async function archiveFormTemplate(
  req: FastifyRequest<{ Params: TemplateParams }>,
  reply: FastifyReply
) {
  try {
    const template = await archiveOwnedFormTemplate(req.authUser!.id, req.params.id)
    if (!template) return reply.status(404).send({ error: 'Formulario nao encontrado' })
    return reply.send({ template: serializeFormTemplate(template) })
  } catch (error) {
    return reply.status(statusForError(error)).send({
      error: errorMessage(error, 'Nao foi possivel arquivar o formulario'),
    })
  }
}

export async function listFormTemplateVersions(
  req: FastifyRequest<{ Params: TemplateParams }>,
  reply: FastifyReply
) {
  const versions = await listOwnedFormTemplateVersions(req.authUser!.id, req.params.id)
  if (!versions) return reply.status(404).send({ error: 'Formulario nao encontrado' })
  return reply.send({ items: versions.map(serializeFormTemplateVersion) })
}
