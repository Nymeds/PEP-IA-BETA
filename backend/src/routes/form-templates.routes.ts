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
export async function formTemplatesRoutes(fastify: FastifyInstance) {
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
