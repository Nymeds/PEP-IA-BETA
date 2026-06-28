import { FastifyReply, FastifyRequest } from 'fastify'
import { getPrisma } from '../lib/prisma'
import { summarizePatient } from '../services/analysis.service'

interface PatientsListQuery {
  search?: string
}

interface PatientBody {
  name?: string
  socialName?: string | null
  cpf?: string | null
  rg?: string | null
  birthDate?: string | null
  sex?: string | null
  maritalStatus?: string | null
  phone?: string | null
  whatsapp?: string | null
  email?: string | null
  cep?: string | null
  address?: string | null
  addressNumber?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  emergencyContact?: string | null
  emergencyPhone?: string | null
  bloodType?: string | null
  allergies?: string | null
  chronicDiseases?: string | null
  notes?: string | null
  quickCreated?: boolean
}

async function findPatientByOwner(id: string, userId: string) {
  return getPrisma().patient.findFirst({
    where: { id, userId },
    include: {
      consultations: {
        orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
        include: { schedule: true },
      },
    },
  })
}

export async function listPatients(
  req: FastifyRequest<{ Querystring: PatientsListQuery }>,
  reply: FastifyReply
) {
  const search = req.query?.search?.trim()
  const patients = await getPrisma().patient.findMany({
    where: {
      userId: req.authUser!.id,
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { socialName: { contains: search } },
              { cpf: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    },
    include: {
      consultations: {
        orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
        take: 10,
        select: {
          id: true,
          patientId: true,
          createdAt: true,
          scheduledAt: true,
          status: true,
          chiefComplaint: true,
          schedule: {
            select: { id: true, title: true, specialty: true },
          },
        },
      },
    },
    orderBy: [{ quickCreated: 'asc' }, { name: 'asc' }],
  })

  return reply.send(patients)
}

export async function getPatient(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const patient = await findPatientByOwner(req.params.id, req.authUser!.id)
  if (!patient) return reply.status(404).send({ error: 'Paciente nao encontrado' })
  return reply.send(patient)
}

export async function createPatient(
  req: FastifyRequest<{ Body: PatientBody }>,
  reply: FastifyReply
) {
  const body = req.body || {}
  if (!body.name?.trim()) {
    return reply.status(400).send({ error: 'Nome do paciente e obrigatorio' })
  }

  const patient = await getPrisma().patient.create({
    data: {
      ...body,
      name: body.name.trim(),
      userId: req.authUser!.id,
      quickCreated: Boolean(body.quickCreated),
    },
  })

  return reply.status(201).send(patient)
}

export async function updatePatient(
  req: FastifyRequest<{ Params: { id: string }; Body: Partial<PatientBody> }>,
  reply: FastifyReply
) {
  const existing = await getPrisma().patient.findFirst({
    where: { id: req.params.id, userId: req.authUser!.id },
    select: { id: true },
  })

  if (!existing) return reply.status(404).send({ error: 'Paciente nao encontrado' })

  const body = req.body || {}

  const patient = await getPrisma().patient.update({
    where: { id: existing.id },
    data: body,
  })

  return reply.send(patient)
}

export async function deletePatient(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const existing = await getPrisma().patient.findFirst({
    where: { id: req.params.id, userId: req.authUser!.id },
    select: { id: true },
  })

  if (!existing) return reply.status(404).send({ error: 'Paciente nao encontrado' })

  await getPrisma().patient.delete({ where: { id: existing.id } })
  return reply.status(204).send()
}

// Gera um resumo clinico do paciente (IA) com base em todos os atendimentos
export async function getPatientSummary(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const patient = await findPatientByOwner(req.params.id, req.authUser!.id)
  if (!patient) return reply.status(404).send({ error: 'Paciente nao encontrado' })

  const relevant = patient.consultations.filter((consultation) => {
    return (
      consultation.transcript ||
      consultation.chiefComplaint ||
      consultation.assessment ||
      consultation.plan
    )
  })

  if (!relevant.length) {
    return reply.send({ summary: null, message: 'Sem atendimentos com conteudo para resumir' })
  }

  const summary = await summarizePatient({
    name: patient.name,
    consultations: relevant.map((consultation) => ({
      date: new Date(consultation.scheduledAt || consultation.createdAt).toLocaleDateString('pt-BR'),
      chiefComplaint: consultation.chiefComplaint,
      mainHypothesis: consultation.mainHypothesis,
      assessment: consultation.assessment,
      plan: consultation.plan,
      currentMedications: consultation.currentMedications,
      allergiesDetails: consultation.allergiesDetails,
    })),
  })

  return reply.send({ summary, consultationCount: relevant.length })
}
