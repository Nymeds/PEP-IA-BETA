import { FastifyInstance } from 'fastify'
import {
  getConsultation,
  transcribeChunk,
  createRealtimeToken,
  appendRealtimeTranscript,
  saveAudio,
  startConsultation,
  streamAudio,
} from '../controllers/consultations.controller'
import {
  changeDynamicFormVersion,
  confirmDynamicDocument,
  exportDynamicDocument,
  generateDynamicDocument,
  getDynamicConversationTopics,
  createDynamicTranscriptVersion,
  listDynamicTranscriptVersions,
  getDynamicRuntime,
  getMedicationReference,
  recordDynamicConsent,
  reinterpretDynamicConsultation,
  reviewMedicationReference,
  resolveDynamicQuarantine,
  updateDynamicFields,
  upsertDynamicParticipant,
} from '../controllers/dynamic-consultations.controller'
export async function consultationsRoutes(fastify: FastifyInstance) {
  fastify.get('/:id', getConsultation)
  fastify.get('/:id/runtime', getDynamicRuntime)
  fastify.patch('/:id/dynamic-fields', updateDynamicFields)
  fastify.post('/:id/form-version', changeDynamicFormVersion)
  fastify.post('/:id/participants', upsertDynamicParticipant)
  fastify.patch('/:id/participants/:participantId', upsertDynamicParticipant)
  fastify.post('/:id/consents', recordDynamicConsent)
  fastify.post('/:id/dynamic-reinterpret', reinterpretDynamicConsultation)
  fastify.get('/:id/topics', getDynamicConversationTopics)
  fastify.post('/:id/versions', createDynamicTranscriptVersion)
  fastify.get('/:id/versions', listDynamicTranscriptVersions)
  fastify.post('/:id/generated-documents', generateDynamicDocument)
  fastify.patch('/:id/generated-documents/:documentId/confirm', confirmDynamicDocument)
  fastify.patch('/:id/quarantine/:itemId', resolveDynamicQuarantine)
  fastify.post('/:id/medication-reference', getMedicationReference)
  fastify.patch('/:id/medication-reference/:referenceId', reviewMedicationReference)
  fastify.get('/:id/export/:kind', exportDynamicDocument)
  fastify.post('/:id/start', startConsultation)
  fastify.post('/:id/transcribe', transcribeChunk)
  fastify.post('/:id/realtime-token', createRealtimeToken)
  fastify.post('/:id/realtime-transcript', appendRealtimeTranscript)
  fastify.post('/:id/audio', saveAudio)
  fastify.get('/:id/audio-file', streamAudio)
}
