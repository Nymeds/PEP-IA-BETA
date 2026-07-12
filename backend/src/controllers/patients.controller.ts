import { FastifyReply, FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import { getPrisma } from '../lib/prisma'
import { summarizePatient } from '../services/analysis.service'

interface PatientsListQuery {
  search?: string
  query?: string
  cursor?: string
  limit?: string
  sort?: 'name_asc' | 'name_desc' | 'recent'
  filter?: 'all' | 'risk' | 'incomplete'
}

interface DuplicateQuery {
  cpf?: string
  name?: string
  birthDate?: string
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
  const search = (req.query?.query || req.query?.search)?.trim()
  const limit = Math.min(100, Math.max(10, Number(req.query?.limit) || 25))
  const offset = Math.max(0, Number(req.query?.cursor) || 0)
  const sort = req.query?.sort || 'name_asc'
  const filter = req.query?.filter || 'all'
  const conditions: Prisma.PatientWhereInput[] = []
  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search } },
        { socialName: { contains: search } },
        { cpf: { contains: search } },
        { phone: { contains: search } },
      ],
    })
  }
  if (filter === 'risk') {
    conditions.push({ OR: [{ allergies: { not: null } }, { chronicDiseases: { not: null } }] })
  } else if (filter === 'incomplete') {
    conditions.push({ quickCreated: true })
  }

  const where: Prisma.PatientWhereInput = {
    userId: req.authUser!.id,
    ...(conditions.length ? { AND: conditions } : {}),
  }
  const orderBy: Prisma.PatientOrderByWithRelationInput[] = sort === 'recent'
    ? [{ updatedAt: 'desc' as const }]
    : [{ quickCreated: 'asc' as const }, { name: sort === 'name_desc' ? 'desc' as const : 'asc' as const }]

  const [patients, total] = await Promise.all([
    getPrisma().patient.findMany({
      where,
      skip: offset,
      take: limit,
      include: {
        consultations: {
          orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
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
      orderBy,
    }),
    getPrisma().patient.count({ where }),
  ])

  return reply.send({
    items: patients,
    total,
    nextCursor: offset + patients.length < total ? String(offset + patients.length) : null,
  })
}

export async function findPatientDuplicates(
  req: FastifyRequest<{ Querystring: DuplicateQuery }>,
  reply: FastifyReply
) {
  const cpf = req.query?.cpf?.replace(/\D/g, '') || ''
  const name = req.query?.name?.trim() || ''
  const birthDate = req.query?.birthDate?.trim() || ''
  if (!cpf && name.length < 2) return reply.send({ matches: [] })

  const patients = await getPrisma().patient.findMany({
    where: {
      userId: req.authUser!.id,
      OR: [
        ...(cpf ? [{ cpf: { contains: cpf } }] : []),
        ...(name ? [{ name: { contains: name } }, { socialName: { contains: name } }] : []),
      ],
      ...(birthDate ? { birthDate } : {}),
    },
    take: 5,
    orderBy: { name: 'asc' },
  })
  return reply.send({ matches: patients })
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

  const normalizedCpf = body.cpf?.replace(/\D/g, '') || ''
  if (normalizedCpf) {
    const duplicate = await getPrisma().patient.findFirst({
      where: { userId: req.authUser!.id, cpf: { contains: normalizedCpf } },
      select: { id: true, name: true },
    })
    if (duplicate) {
      return reply.status(409).send({
        error: `Ja existe um paciente com este CPF: ${duplicate.name}`,
        code: 'PATIENT_DUPLICATE_CPF',
      })
    }
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
