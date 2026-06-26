import { FastifyRequest, FastifyReply } from 'fastify'
import { createReadStream, existsSync } from 'fs'
import { getPrisma } from '../lib/prisma'
import { transcribeAudioBuffer, saveFullAudio } from '../services/speech.service'
import { reinterpretFullTranscript, serializeExtractedToDb } from '../services/extraction.service'
import { runFinalReview } from '../services/review.service'
import { suggestTopics } from '../services/analysis.service'
import { generateSoap } from '../services/soap.service'

// Campos clínicos do PEP que entram no snapshot de versão
const CLINICAL_FIELDS = [
  'chiefComplaint', 'hda', 'symptomStart', 'symptomIntensity', 'symptoms',
  'improvingFactors', 'worseningFactors', 'previousDiseases', 'surgeries',
  'hospitalizations', 'allergiesDetails', 'currentMedications', 'familyHistory',
  'smoking', 'alcohol', 'physicalActivity', 'sleep', 'diet', 'drugs', 'occupation',
  'systemsReview', 'vitalSigns', 'weight', 'height', 'bmi', 'generalState',
  'physicalExam', 'mainHypothesis', 'differentials', 'confirmedDiagnosis', 'cid',
  'therapeuticPlan', 'orientations', 'referrals', 'followUpDate',
  'subjective', 'objective', 'assessment', 'plan',
] as const

function buildSnapshot(consultation: Record<string, unknown>): Record<string, unknown> {
  const snap: Record<string, unknown> = {}
  for (const f of CLINICAL_FIELDS) snap[f] = consultation[f] ?? null
  return snap
}

export async function createConsultation(
  req: FastifyRequest<{ Body: { patientId: string; scheduledAt?: string; status?: string } }>,
  reply: FastifyReply
) {
  const { patientId, scheduledAt, status } = req.body
  const consultation = await getPrisma().consultation.create({
    data: {
      patientId,
      // Se vier com data agendada, nasce como "scheduled"; senão "active" (atendimento imediato)
      status: status ?? (scheduledAt ? 'scheduled' : 'active'),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    },
    include: { patient: true },
  })
  return reply.status(201).send(consultation)
}

// Encerra a consulta: marca como concluída (sem necessariamente gerar SOAP de novo).
export async function closeConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.update({
    where: { id: req.params.id },
    data: { status: 'completed' },
  })
  return reply.send(consultation)
}

export async function getConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.findUnique({
    where: { id: req.params.id },
    include: { patient: true },
  })
  if (!consultation) return reply.status(404).send({ error: 'Consulta nao encontrada' })
  return reply.send(consultation)
}

export async function updateConsultation(
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
  reply: FastifyReply
) {
  const { id } = req.params
  const body = req.body as Record<string, unknown>
  // Remove read-only fields
  const { id: _id, patientId: _pid, createdAt: _ca, updatedAt: _ua, patient: _p, ...data } = body
  void _id; void _pid; void _ca; void _ua; void _p
  const consultation = await getPrisma().consultation.update({
    where: { id },
    data: data as Record<string, unknown>,
  })
  return reply.send(consultation)
}

// Transcreve um chunk de áudio, filtra alucinações e acumula no transcript.
// Rápido e barato — NÃO faz extração clínica (isso fica na re-interpretação periódica).
export async function transcribeChunk(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const fileData = await req.file()
  if (!fileData) return reply.status(400).send({ error: 'Nenhum arquivo de audio recebido' })

  const buffer = await fileData.toBuffer()
  const mimeType = fileData.mimetype || 'audio/webm'

  const chunkTranscript = await transcribeAudioBuffer(buffer, mimeType)

  // Chunk vazio (silêncio ou alucinação descartada) — não acumula nada
  if (!chunkTranscript.trim()) {
    return reply.send({ chunkTranscript: '', fullTranscript: null })
  }

  const existing = await getPrisma().consultation.findUnique({
    where: { id: req.params.id },
    select: { transcript: true },
  })

  const prev = existing?.transcript || ''
  const fullTranscript = prev ? `${prev} ${chunkTranscript}` : chunkTranscript

  await getPrisma().consultation.update({
    where: { id: req.params.id },
    data: { transcript: fullTranscript },
  })

  return reply.send({ chunkTranscript, fullTranscript })
}

// Relê toda a transcrição acumulada e devolve o estado consolidado dos campos.
// Chamado periodicamente pelo frontend (ex: a cada poucos chunks) e ao finalizar.
export async function reinterpretConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.findUnique({
    where: { id: req.params.id },
    select: { transcript: true },
  })

  if (!consultation?.transcript?.trim()) {
    return reply.send({ extracted: {} })
  }

  const extracted = await reinterpretFullTranscript(consultation.transcript)
  return reply.send({ extracted })
}

export async function saveAudio(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const fileData = await req.file()
  if (!fileData) return reply.status(400).send({ error: 'Nenhum arquivo de audio' })

  const buffer = await fileData.toBuffer()
  const mimeType = fileData.mimetype || 'audio/webm'
  const filePath = await saveFullAudio(req.params.id, buffer, mimeType)

  await getPrisma().consultation.update({
    where: { id: req.params.id },
    data: { audioPath: filePath },
  })

  return reply.send({ audioPath: filePath })
}

// Revisão final completa: separa os falantes (diarização), relê tudo com análise
// apurada, corrige os campos do PEP e gera o SOAP. Chamado ao finalizar a consulta.
export async function finalizeConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.findUnique({
    where: { id: req.params.id },
    select: { transcript: true },
  })

  if (!consultation?.transcript) {
    return reply.status(400).send({ error: 'Nenhuma transcricao disponivel para revisao' })
  }

  // 1. Diarização + extração apurada sobre o diálogo estruturado
  const review = await runFinalReview(consultation.transcript)

  // 2. SOAP gerado a partir do diálogo já estruturado (mais preciso)
  const soap = await generateSoap(review.structuredText)

  // 3. Persiste tudo: diálogo estruturado, campos corrigidos e SOAP
  const fieldUpdates = serializeExtractedToDb(review.extracted)

  await getPrisma().consultation.update({
    where: { id: req.params.id },
    data: {
      ...fieldUpdates,
      transcriptStructured: JSON.stringify(review.turns),
      ...soap,
      status: 'completed',
    },
  })

  return reply.send({
    soap,
    extracted: review.extracted,
    turns: review.turns,
  })
}

export async function listPatientConsultations(
  req: FastifyRequest<{ Params: { patientId: string } }>,
  reply: FastifyReply
) {
  const consultations = await getPrisma().consultation.findMany({
    where: { patientId: req.params.patientId },
    orderBy: { createdAt: 'desc' },
    include: { patient: { select: { name: true } } },
  })
  return reply.send(consultations)
}

// Faz stream do áudio gravado da consulta (para o player no frontend)
export async function streamAudio(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.findUnique({
    where: { id: req.params.id },
    select: { audioPath: true },
  })

  if (!consultation?.audioPath || !existsSync(consultation.audioPath)) {
    return reply.status(404).send({ error: 'Áudio não encontrado' })
  }

  const contentType = consultation.audioPath.endsWith('.mp3') ? 'audio/mpeg' : 'audio/webm'
  return reply.type(contentType).send(createReadStream(consultation.audioPath))
}

// Sugere tópicos da conversa (IA) e os trechos relacionados
export async function getConversationTopics(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const consultation = await getPrisma().consultation.findUnique({
    where: { id: req.params.id },
    select: { transcript: true },
  })
  if (!consultation?.transcript?.trim()) return reply.send({ topics: [] })

  const topics = await suggestTopics(consultation.transcript)
  return reply.send({ topics })
}

// Cria uma NOVA versão do prontuário a partir de uma edição da transcrição.
// Preserva o estado anterior (anti-adulteração) e re-extrai o PEP do novo texto.
export async function createVersion(
  req: FastifyRequest<{
    Params: { id: string }
    Body: { newTranscript: string; reason?: string; editDiff?: { before: string; after: string } }
  }>,
  reply: FastifyReply
) {
  const { id } = req.params
  const { newTranscript, reason, editDiff } = req.body

  if (!newTranscript?.trim()) {
    return reply.status(400).send({ error: 'Transcrição editada não pode ser vazia' })
  }

  const current = await getPrisma().consultation.findUnique({ where: { id } })
  if (!current) return reply.status(404).send({ error: 'Consulta não encontrada' })

  // 1. Congela o estado ATUAL como uma versão histórica (não é sobrescrito)
  const count = await getPrisma().consultationVersion.count({ where: { consultationId: id } })
  await getPrisma().consultationVersion.create({
    data: {
      consultationId: id,
      version: count + 1,
      snapshot: JSON.stringify(buildSnapshot(current as unknown as Record<string, unknown>)),
      transcript: current.transcript,
      reason: reason ?? 'Edição da transcrição',
      editDiff: editDiff ? JSON.stringify(editDiff) : null,
    },
  })

  // 2. Aplica a transcrição editada e RE-EXTRAI todo o PEP a partir dela
  const extracted = await reinterpretFullTranscript(newTranscript)
  const fieldUpdates = serializeExtractedToDb(extracted)

  const updated = await getPrisma().consultation.update({
    where: { id },
    data: { ...fieldUpdates, transcript: newTranscript },
    include: { patient: true },
  })

  return reply.send({ consultation: updated, extracted, savedVersion: count + 1 })
}

// Lista as versões históricas do prontuário (estados anteriores preservados)
export async function listVersions(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const versions = await getPrisma().consultationVersion.findMany({
    where: { consultationId: req.params.id },
    orderBy: { version: 'desc' },
  })
  return reply.send(versions)
}
