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
  updateAiState,
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
import {
  changeDynamicFormVersion,
  confirmDynamicDocument,
  diarizeDynamicConsultation,
  exportDynamicDocument,
  generateDynamicDocument,
  getDynamicRuntime,
  getMedicationReference,
  recordDynamicConsent,
  reinterpretDynamicConsultation,
  reviewMedicationReference,
  resolveDynamicQuarantine,
  updateDynamicFields,
  upsertDynamicParticipant,
} from '../controllers/dynamic-consultations.controller'
import { isDynamicPsychologyEnabled } from '../services/form-templates.service'

async function requireDynamicPsychology(_request: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) {
  if (!isDynamicPsychologyEnabled()) {
    return reply.status(404).send({ error: 'Formularios dinamicos estao desativados' })
  }
}

export async function consultationsRoutes(fastify: FastifyInstance) {
  const dynamicOnly = { preHandler: requireDynamicPsychology }
  fastify.post('/', createConsultation)
  fastify.get('/:id', getConsultation)
  fastify.get('/:id/runtime', dynamicOnly, getDynamicRuntime)
  fastify.put('/:id', updateConsultation)
  fastify.patch('/:id/dynamic-fields', dynamicOnly, updateDynamicFields)
  fastify.post('/:id/form-version', dynamicOnly, changeDynamicFormVersion)
  fastify.post('/:id/participants', dynamicOnly, upsertDynamicParticipant)
  fastify.patch('/:id/participants/:participantId', dynamicOnly, upsertDynamicParticipant)
  fastify.post('/:id/consents', dynamicOnly, recordDynamicConsent)
  fastify.post('/:id/dynamic-reinterpret', dynamicOnly, reinterpretDynamicConsultation)
  fastify.post('/:id/diarize', dynamicOnly, diarizeDynamicConsultation)
  fastify.post('/:id/generated-documents', dynamicOnly, generateDynamicDocument)
  fastify.patch('/:id/generated-documents/:documentId/confirm', dynamicOnly, confirmDynamicDocument)
  fastify.patch('/:id/quarantine/:itemId', dynamicOnly, resolveDynamicQuarantine)
  fastify.post('/:id/medication-reference', dynamicOnly, getMedicationReference)
  fastify.patch('/:id/medication-reference/:referenceId', dynamicOnly, reviewMedicationReference)
  fastify.get('/:id/export/:kind', dynamicOnly, exportDynamicDocument)
  fastify.post('/:id/start', startConsultation)
  fastify.post('/:id/transcribe', transcribeChunk)
  fastify.post('/:id/realtime-token', createRealtimeToken)
  fastify.post('/:id/realtime-transcript', appendRealtimeTranscript)
  fastify.get('/:id/raw-transcript', getRawTranscript)
  fastify.post('/:id/reinterpret', reinterpretConsultation)
  fastify.patch('/:id/ai-state', updateAiState)
  fastify.post('/:id/audio', saveAudio)
  fastify.post('/:id/finalize', finalizeConsultation)
  fastify.post('/:id/close', closeConsultation)
  fastify.get('/:id/audio-file', streamAudio)
  fastify.get('/:id/topics', getConversationTopics)
  fastify.post('/:id/versions', createVersion)
  fastify.get('/:id/versions', listVersions)
  fastify.get('/patient/:patientId', listPatientConsultations)
}
