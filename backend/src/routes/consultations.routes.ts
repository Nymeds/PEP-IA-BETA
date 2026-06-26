import { FastifyInstance } from 'fastify'
import {
  createConsultation,
  getConsultation,
  updateConsultation,
  transcribeChunk,
  reinterpretConsultation,
  saveAudio,
  finalizeConsultation,
  closeConsultation,
  listPatientConsultations,
  streamAudio,
  getConversationTopics,
  createVersion,
  listVersions,
} from '../controllers/consultations.controller'

export async function consultationsRoutes(fastify: FastifyInstance) {
  fastify.post('/', createConsultation)
  fastify.get('/:id', getConsultation)
  fastify.put('/:id', updateConsultation)
  fastify.post('/:id/transcribe', transcribeChunk)
  fastify.post('/:id/reinterpret', reinterpretConsultation)
  fastify.post('/:id/audio', saveAudio)
  fastify.post('/:id/finalize', finalizeConsultation)
  fastify.post('/:id/close', closeConsultation)
  fastify.get('/:id/audio-file', streamAudio)
  fastify.get('/:id/topics', getConversationTopics)
  fastify.post('/:id/versions', createVersion)
  fastify.get('/:id/versions', listVersions)
  fastify.get('/patient/:patientId', listPatientConsultations)
}
