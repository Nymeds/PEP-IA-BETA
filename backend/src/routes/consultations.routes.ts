import { FastifyInstance } from 'fastify'
import {
  createConsultation,
  getConsultation,
  updateConsultation,
  transcribeChunk,
  createRealtimeToken,
  appendRealtimeTranscript,
  getRawTranscript,
  reinterpretConsultation,
  saveAudio,
  finalizeConsultation,
  closeConsultation,
  startConsultation,
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
  fastify.post('/:id/start', startConsultation)
  fastify.post('/:id/transcribe', transcribeChunk)
  fastify.post('/:id/realtime-token', createRealtimeToken)
  fastify.post('/:id/realtime-transcript', appendRealtimeTranscript)
  fastify.get('/:id/raw-transcript', getRawTranscript)
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
