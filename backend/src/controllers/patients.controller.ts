import { FastifyRequest, FastifyReply } from 'fastify'
import { Prisma } from '@prisma/client'
import { getPrisma } from '../lib/prisma'
import { summarizePatient } from '../services/analysis.service'

export async function listPatients(_req: FastifyRequest, reply: FastifyReply) {
  const patients = await getPrisma().patient.findMany({
    include: {
      consultations: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, createdAt: true, status: true, chiefComplaint: true },
      },
    },
    orderBy: { name: 'asc' },
  })
  return reply.send(patients)
}

export async function getPatient(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const patient = await getPrisma().patient.findUnique({
    where: { id: req.params.id },
    include: { consultations: { orderBy: { createdAt: 'desc' } } },
  })
  if (!patient) return reply.status(404).send({ error: 'Paciente não encontrado' })
  return reply.send(patient)
}

export async function createPatient(
  req: FastifyRequest<{ Body: Prisma.PatientCreateInput }>,
  reply: FastifyReply
) {
  const patient = await getPrisma().patient.create({ data: req.body })
  return reply.status(201).send(patient)
}

export async function updatePatient(
  req: FastifyRequest<{ Params: { id: string }; Body: Prisma.PatientUpdateInput }>,
  reply: FastifyReply
) {
  const patient = await getPrisma().patient.update({
    where: { id: req.params.id },
    data: req.body,
  })
  return reply.send(patient)
}

export async function deletePatient(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  await getPrisma().patient.delete({ where: { id: req.params.id } })
  return reply.status(204).send()
}

// Gera um resumo clínico do paciente (IA) com base em todos os atendimentos
export async function getPatientSummary(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const patient = await getPrisma().patient.findUnique({
    where: { id: req.params.id },
    include: { consultations: { orderBy: { createdAt: 'asc' } } },
  })
  if (!patient) return reply.status(404).send({ error: 'Paciente não encontrado' })

  // Considera apenas atendimentos com algum conteúdo clínico
  const relevant = patient.consultations.filter(
    (c) => c.transcript || c.chiefComplaint || c.assessment || c.plan
  )

  if (!relevant.length) {
    return reply.send({ summary: null, message: 'Sem atendimentos com conteúdo para resumir' })
  }

  const summary = await summarizePatient({
    name: patient.name,
    consultations: relevant.map((c) => ({
      date: new Date(c.createdAt).toLocaleDateString('pt-BR'),
      chiefComplaint: c.chiefComplaint,
      mainHypothesis: c.mainHypothesis,
      assessment: c.assessment,
      plan: c.plan,
      currentMedications: c.currentMedications,
      allergiesDetails: c.allergiesDetails,
    })),
  })

  return reply.send({ summary, consultationCount: relevant.length })
}
