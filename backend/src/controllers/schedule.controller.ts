import { FastifyReply, FastifyRequest } from 'fastify'
import { getPrisma } from '../lib/prisma'
import {
  CONSULTATION_STATUS,
  formatLocalDate,
  formatLocalDateTime,
  fromPrismaScheduleSettings,
  generateSlotsForDate,
  getDateAvailability,
  getEnabledShiftCount,
  getMaxAppointmentsPerDay,
  normalizeConsultationStatus,
  normalizeScheduleSettings,
  normalizeScheduleStatus,
  toPrismaScheduleSettings,
} from '../lib/schedule'

interface ScheduleSettingsBody {
  title?: string
  specialty?: string
  status?: string
  activeWeekDays?: number[]
  workOnHolidays?: boolean
  appointmentDurationMinutes?: number
  shifts?: Array<{
    id?: string
    label?: string
    enabled?: boolean
    start?: string
    end?: string
    slots?: number
  }>
}

interface AgendaParams {
  agendaId: string
}

interface CalendarQuery {
  month?: string
}

interface SlotsQuery {
  date?: string
}

interface QuickBookBody {
  patientId?: string
  patientName?: string
  scheduledAt?: string
}

interface ScheduleRecord {
  id: string
  userId: string
  title: string
  specialty: string
  status: string
  activeWeekDaysJson: string
  workOnHolidays: boolean
  appointmentDurationMinutes: number
  shiftsJson: string
  createdAt: Date
  updatedAt: Date
}

function createHttpError(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

function getErrorStatus(error: unknown, fallback: number) {
  if (typeof error === 'object' && error && 'status' in error) {
    const status = Number((error as { status?: unknown }).status)
    if (Number.isInteger(status)) return status
  }
  return fallback
}

function parseMonth(month?: string) {
  const now = new Date()
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const value = month?.trim() || fallback

  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error('Mes invalido. Use o formato AAAA-MM')
  }

  const [year, monthValue] = value.split('-').map(Number)
  const start = new Date(year, monthValue - 1, 1, 0, 0, 0, 0)
  const end = new Date(year, monthValue, 0, 23, 59, 59, 999)
  return { value, start, end }
}

function parseDate(value?: string): { input: string; date: Date } {
  const input = value?.trim() || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error('Data invalida. Use o formato AAAA-MM-DD')
  }

  const date = new Date(`${input}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Data invalida')
  }

  return { input, date }
}

function serializeAgenda(record: ScheduleRecord) {
  const settings = fromPrismaScheduleSettings(record)
  return {
    id: record.id,
    title: record.title,
    specialty: record.specialty,
    status: normalizeScheduleStatus(record.status),
    activeWeekDays: settings.activeWeekDays,
    workOnHolidays: settings.workOnHolidays,
    appointmentDurationMinutes: settings.appointmentDurationMinutes,
    shifts: settings.shifts,
    enabledShiftCount: getEnabledShiftCount(settings),
    maxAppointmentsPerDay: getMaxAppointmentsPerDay(settings),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function serializeAppointment(consultation: {
  id: string
  patientId: string
  scheduledAt: Date | null
  status: string
  chiefComplaint: string | null
  patient: { name: string }
  schedule: { id: string; title: string; specialty: string } | null
}) {
  return {
    id: consultation.id,
    patientId: consultation.patientId,
    patientName: consultation.patient.name,
    scheduledAt: consultation.scheduledAt?.toISOString() || null,
    localDateTime: consultation.scheduledAt
      ? formatLocalDateTime(new Date(consultation.scheduledAt))
      : null,
    status: normalizeConsultationStatus(consultation.status),
    chiefComplaint: consultation.chiefComplaint,
    scheduleId: consultation.schedule?.id || null,
    scheduleTitle: consultation.schedule?.title || null,
    scheduleSpecialty: consultation.schedule?.specialty || null,
  }
}

async function findOwnedAgenda(agendaId: string, userId: string) {
  return getPrisma().schedule.findFirst({
    where: { id: agendaId, userId },
  })
}

async function listDayAppointments(userId: string, dateString: string) {
  const dayStart = new Date(`${dateString}T00:00:00`)
  const dayEnd = new Date(`${dateString}T23:59:59.999`)
  return getPrisma().consultation.findMany({
    where: {
      userId,
      scheduledAt: { gte: dayStart, lte: dayEnd },
    },
    include: {
      patient: { select: { name: true } },
      schedule: { select: { id: true, title: true, specialty: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  })
}

async function validateAgendaSlot(
  userId: string,
  agenda: ScheduleRecord,
  requestedAt: Date
) {
  if (requestedAt.getTime() < Date.now() - 60_000) {
    throw createHttpError('Nao e possivel agendar consultas no passado', 400)
  }

  const settings = fromPrismaScheduleSettings(agenda)
  const dateString = formatLocalDate(requestedAt)
  const availability = getDateAvailability(new Date(`${dateString}T00:00:00`), settings, {
    scheduleStatus: agenda.status,
  })

  if (!availability.allowed) {
    throw createHttpError(availability.reason || 'Dia indisponivel na agenda', 400)
  }

  const dayAppointments = await listDayAppointments(userId, dateString)
  if (dayAppointments.length >= getMaxAppointmentsPerDay(settings)) {
    throw createHttpError('Nao ha mais vagas disponiveis para este dia', 409)
  }

  const requestedLocalDateTime = formatLocalDateTime(requestedAt)
  const generatedSlots = generateSlotsForDate(dateString, settings)
  if (!generatedSlots.some((slot) => slot.localDateTime === requestedLocalDateTime)) {
    throw createHttpError('O horario informado nao pertence a um turno ativo da agenda', 400)
  }

  if (
    dayAppointments.some(
      (appointment) =>
        appointment.scheduledAt &&
        formatLocalDateTime(new Date(appointment.scheduledAt)) === requestedLocalDateTime
    )
  ) {
    throw createHttpError('Este horario ja esta ocupado por outra consulta deste medico', 409)
  }

  return { settings, dayAppointments }
}

function parseAgendaPayload(body: ScheduleSettingsBody) {
  const title = body.title?.trim() || ''
  const specialty = body.specialty?.trim() || ''

  if (!title) throw createHttpError('Informe o nome da agenda', 400)
  if (!specialty) throw createHttpError('Informe a especialidade da agenda', 400)

  const settings = normalizeScheduleSettings({
    activeWeekDays: body.activeWeekDays,
    workOnHolidays: body.workOnHolidays,
    appointmentDurationMinutes: body.appointmentDurationMinutes,
    shifts: body.shifts?.map((shift) => ({
      id: shift.id || '',
      label: shift.label || '',
      enabled: Boolean(shift.enabled),
      start: shift.start || '',
      end: shift.end || '',
      slots: Number(shift.slots) || 0,
    })),
  })

  return {
    title,
    specialty,
    status: normalizeScheduleStatus(body.status),
    settings,
  }
}

export async function listSchedules(req: FastifyRequest, reply: FastifyReply) {
  const agendas = await getPrisma().schedule.findMany({
    where: { userId: req.authUser!.id },
    orderBy: [{ status: 'asc' }, { title: 'asc' }],
  })

  return reply.send({
    agendas: agendas.map((agenda) => serializeAgenda(agenda)),
  })
}

export async function createSchedule(
  req: FastifyRequest<{ Body: ScheduleSettingsBody }>,
  reply: FastifyReply
) {
  try {
    const payload = parseAgendaPayload(req.body || {})
    const agenda = await getPrisma().schedule.create({
      data: {
        userId: req.authUser!.id,
        title: payload.title,
        specialty: payload.specialty,
        status: payload.status,
        ...toPrismaScheduleSettings(payload.settings),
      },
    })

    return reply.status(201).send({ agenda: serializeAgenda(agenda) })
  } catch (error) {
    return reply.status(getErrorStatus(error, 400)).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel criar a agenda',
    })
  }
}

export async function getSchedule(
  req: FastifyRequest<{ Params: AgendaParams }>,
  reply: FastifyReply
) {
  const agenda = await findOwnedAgenda(req.params.agendaId, req.authUser!.id)
  if (!agenda) return reply.status(404).send({ error: 'Agenda nao encontrada' })
  return reply.send({ agenda: serializeAgenda(agenda) })
}

export async function updateSchedule(
  req: FastifyRequest<{ Params: AgendaParams; Body: ScheduleSettingsBody }>,
  reply: FastifyReply
) {
  try {
    const existing = await findOwnedAgenda(req.params.agendaId, req.authUser!.id)
    if (!existing) return reply.status(404).send({ error: 'Agenda nao encontrada' })

    const payload = parseAgendaPayload(req.body || {})
    const agenda = await getPrisma().schedule.update({
      where: { id: existing.id },
      data: {
        title: payload.title,
        specialty: payload.specialty,
        status: payload.status,
        ...toPrismaScheduleSettings(payload.settings),
      },
    })

    return reply.send({ agenda: serializeAgenda(agenda) })
  } catch (error) {
    return reply.status(getErrorStatus(error, 400)).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel atualizar a agenda',
    })
  }
}

export async function getDashboard(
  req: FastifyRequest<{ Querystring: CalendarQuery }>,
  reply: FastifyReply
) {
  try {
    const { value, start, end } = parseMonth(req.query?.month)
    const userId = req.authUser!.id
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const [
      agendas,
      monthAppointments,
      futureAppointments,
      patientsCount,
      consultationsCount,
      waitingConsultationsCount,
      inProgressConsultationsCount,
      completedConsultationsCount,
      todayAppointmentsCount,
    ] = await Promise.all([
      getPrisma().schedule.findMany({
        where: { userId },
        orderBy: [{ status: 'asc' }, { title: 'asc' }],
      }),
      getPrisma().consultation.findMany({
        where: {
          userId,
          scheduleId: { not: null },
          scheduledAt: { gte: start, lte: end },
        },
        include: {
          patient: { select: { name: true } },
          schedule: { select: { id: true, title: true, specialty: true } },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
      getPrisma().consultation.findMany({
        where: {
          userId,
          scheduleId: { not: null },
          scheduledAt: { gte: new Date() },
        },
        include: {
          patient: { select: { name: true } },
          schedule: { select: { id: true, title: true, specialty: true } },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
      getPrisma().patient.count({ where: { userId } }),
      getPrisma().consultation.count({ where: { userId } }),
      getPrisma().consultation.count({
        where: { userId, status: { in: [CONSULTATION_STATUS.WAITING, 'scheduled'] } },
      }),
      getPrisma().consultation.count({
        where: { userId, status: { in: [CONSULTATION_STATUS.IN_PROGRESS, 'active'] } },
      }),
      getPrisma().consultation.count({
        where: { userId, status: { in: [CONSULTATION_STATUS.FINISHED, 'completed'] } },
      }),
      getPrisma().consultation.count({
        where: {
          userId,
          scheduledAt: { gte: todayStart, lte: todayEnd },
        },
      }),
    ])

    const monthAppointmentsByAgenda = new Map<string, typeof monthAppointments>()
    for (const appointment of monthAppointments) {
      const scheduleId = appointment.schedule?.id
      if (!scheduleId) continue
      const current = monthAppointmentsByAgenda.get(scheduleId) || []
      current.push(appointment)
      monthAppointmentsByAgenda.set(scheduleId, current)
    }

    const nextAppointmentByAgenda = new Map<string, (typeof futureAppointments)[number]>()
    for (const appointment of futureAppointments) {
      const scheduleId = appointment.schedule?.id
      if (!scheduleId || nextAppointmentByAgenda.has(scheduleId)) continue
      nextAppointmentByAgenda.set(scheduleId, appointment)
    }

    return reply.send({
      month: value,
      agendas: agendas.map((agenda) => {
        const agendaAppointments = monthAppointmentsByAgenda.get(agenda.id) || []
        const todayCount = agendaAppointments.filter((appointment) => {
          return (
            appointment.scheduledAt &&
            formatLocalDate(new Date(appointment.scheduledAt)) === formatLocalDate(new Date())
          )
        }).length

        return {
          ...serializeAgenda(agenda),
          appointmentsThisMonthCount: agendaAppointments.length,
          todayAppointmentsCount: todayCount,
          nextAppointment: nextAppointmentByAgenda.has(agenda.id)
            ? serializeAppointment(nextAppointmentByAgenda.get(agenda.id)!)
            : null,
        }
      }),
      stats: {
        patientsCount,
        consultationsCount,
        waitingConsultationsCount,
        inProgressConsultationsCount,
        completedConsultationsCount,
        todayAppointmentsCount,
      },
    })
  } catch (error) {
    return reply.status(400).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel carregar o dashboard',
    })
  }
}

export async function getCalendar(
  req: FastifyRequest<{ Params: AgendaParams; Querystring: CalendarQuery }>,
  reply: FastifyReply
) {
  try {
    const agenda = await findOwnedAgenda(req.params.agendaId, req.authUser!.id)
    if (!agenda) return reply.status(404).send({ error: 'Agenda nao encontrada' })

    const { value, start, end } = parseMonth(req.query?.month)
    const appointments = await getPrisma().consultation.findMany({
      where: {
        userId: req.authUser!.id,
        scheduleId: agenda.id,
        scheduledAt: { gte: start, lte: end },
      },
      include: {
        patient: { select: { name: true } },
        schedule: { select: { id: true, title: true, specialty: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    })

    const waitingConsultationsCount = appointments.filter(
      (appointment) => normalizeConsultationStatus(appointment.status) === CONSULTATION_STATUS.WAITING
    ).length
    const completedConsultationsCount = appointments.filter(
      (appointment) =>
        normalizeConsultationStatus(appointment.status) === CONSULTATION_STATUS.FINISHED
    ).length
    const todayKey = formatLocalDate(new Date())
    const todayAppointmentsCount = appointments.filter((appointment) => {
      return (
        appointment.scheduledAt &&
        formatLocalDate(new Date(appointment.scheduledAt)) === todayKey
      )
    }).length

    return reply.send({
      month: value,
      agenda: serializeAgenda(agenda),
      appointments: appointments.map(serializeAppointment),
      stats: {
        scheduledThisMonthCount: appointments.length,
        waitingConsultationsCount,
        completedConsultationsCount,
        todayAppointmentsCount,
      },
    })
  } catch (error) {
    return reply.status(400).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel carregar o calendario',
    })
  }
}

export async function getAvailableSlots(
  req: FastifyRequest<{ Params: AgendaParams; Querystring: SlotsQuery }>,
  reply: FastifyReply
) {
  try {
    const agenda = await findOwnedAgenda(req.params.agendaId, req.authUser!.id)
    if (!agenda) return reply.status(404).send({ error: 'Agenda nao encontrada' })

    const { input, date } = parseDate(req.query?.date)
    const settings = fromPrismaScheduleSettings(agenda)
    const availability = getDateAvailability(date, settings, { scheduleStatus: agenda.status })
    const appointments = await listDayAppointments(req.authUser!.id, input)

    const generatedSlots = availability.allowed ? generateSlotsForDate(input, settings) : []
    const appointmentsBySlot = new Map(
      appointments
        .filter((appointment) => appointment.scheduledAt)
        .map((appointment) => [
          formatLocalDateTime(new Date(appointment.scheduledAt as Date)),
          serializeAppointment(appointment),
        ])
    )

    return reply.send({
      date: input,
      allowed: availability.allowed,
      reason: availability.reason || null,
      isHoliday: availability.isHoliday,
      agenda: serializeAgenda(agenda),
      enabledShiftCount: getEnabledShiftCount(settings),
      maxAppointmentsPerDay: getMaxAppointmentsPerDay(settings),
      occupiedCount: appointments.length,
      slots: generatedSlots.map((slot) => ({
        ...slot,
        available: !appointmentsBySlot.has(slot.localDateTime),
        appointment: appointmentsBySlot.get(slot.localDateTime) || null,
      })),
      appointments: appointments.map(serializeAppointment),
    })
  } catch (error) {
    return reply.status(400).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel carregar os horarios',
    })
  }
}

export async function quickBookAppointment(
  req: FastifyRequest<{ Params: AgendaParams; Body: QuickBookBody }>,
  reply: FastifyReply
) {
  try {
    const userId = req.authUser!.id
    const patientName = req.body?.patientName?.trim() || ''
    const patientId = req.body?.patientId?.trim() || ''
    const scheduledAt = req.body?.scheduledAt?.trim() || ''

    if (!scheduledAt) {
      return reply.status(400).send({ error: 'Informe a data e hora do agendamento' })
    }

    const requestedAt = new Date(scheduledAt)
    if (Number.isNaN(requestedAt.getTime())) {
      return reply.status(400).send({ error: 'Data e hora do agendamento invalidas' })
    }

    if (!patientId && !patientName) {
      return reply.status(400).send({
        error: 'Selecione um paciente ou informe um nome para cadastro rapido',
      })
    }

    const agenda = await findOwnedAgenda(req.params.agendaId, userId)
    if (!agenda) return reply.status(404).send({ error: 'Agenda nao encontrada' })

    await validateAgendaSlot(userId, agenda, requestedAt)

    const prisma = getPrisma()
    let patient = patientId
      ? await prisma.patient.findFirst({
          where: { id: patientId, userId },
          select: { id: true, name: true },
        })
      : null

    if (!patient && patientName) {
      patient = await prisma.patient.findFirst({
        where: {
          userId,
          OR: [{ name: patientName }, { socialName: patientName }],
        },
        select: { id: true, name: true },
      })
    }

    if (!patient && patientName) {
      patient = await prisma.patient.create({
        data: {
          userId,
          name: patientName,
          quickCreated: true,
        },
        select: { id: true, name: true },
      })
    }

    if (!patient) {
      return reply.status(404).send({ error: 'Paciente nao encontrado para este usuario' })
    }

    const consultation = await prisma.consultation.create({
      data: {
        userId,
        patientId: patient.id,
        scheduleId: agenda.id,
        status: CONSULTATION_STATUS.WAITING,
        scheduledAt: requestedAt,
      },
      include: {
        patient: true,
        schedule: true,
      },
    })

    return reply.status(201).send(consultation)
  } catch (error) {
    return reply.status(getErrorStatus(error, 400)).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel agendar a consulta',
    })
  }
}
