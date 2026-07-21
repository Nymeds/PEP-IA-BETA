import { FastifyInstance } from 'fastify'
import {
  archiveFormTemplate,
  copyFormTemplate,
  createFormTemplate,
  getFormTemplate,
  listFormTemplates,
  listFormTemplateVersions,
  publishFormTemplate,
  setDefaultFormTemplate,
  updateFormTemplate,
} from '../controllers/form-templates.controller'
import { isDynamicPsychologyEnabled } from '../services/form-templates.service'

export async function formTemplatesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (_request, reply) => {
    if (!isDynamicPsychologyEnabled()) {
      return reply.status(404).send({ error: 'Formularios dinamicos estao desativados' })
    }
  })
  fastify.get('/', listFormTemplates)
  fastify.post('/', createFormTemplate)
  fastify.get('/:id', getFormTemplate)
  fastify.patch('/:id', updateFormTemplate)
  fastify.post('/:id/publish', publishFormTemplate)
  fastify.post('/:id/copy', copyFormTemplate)
  fastify.post('/:id/default', setDefaultFormTemplate)
  fastify.post('/:id/archive', archiveFormTemplate)
  fastify.delete('/:id', archiveFormTemplate)
  fastify.get('/:id/versions', listFormTemplateVersions)
}
