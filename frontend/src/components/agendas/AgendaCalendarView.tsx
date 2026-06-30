'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  CalendarClock,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Stethoscope,
} from 'lucide-react'
import { api } from '@/services/api'
import { ScheduleAgendaSlotsResponse, ScheduleSlot } from '@/types'
import { formatDateHeading, formatDateTimeLabel, dateToInput } from '../dashboard/calendar-utils'
import { cn } from '../shared/utils'
import { AgendaQuickScheduleModal } from './AgendaQuickScheduleModal'

function parseInputDate(input: string) {
  return new Date(`${input}T00:00:00`)
}

function shiftDate(input: string, offset: number) {
  const date = parseInputDate(input)
  date.setDate(date.getDate() + offset)
  return dateToInput(date)
}

function getWeekStart(date: Date) {
  const value = new Date(date)
  const currentDay = value.getDay()
  const diff = currentDay === 0 ? -6 : 1 - currentDay
  value.setDate(value.getDate() + diff)
  value.setHours(0, 0, 0, 0)
  return value
}

function getWeekDates(selectedDate: string) {
  const start = getWeekStart(parseInputDate(selectedDate))
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return dateToInput(day)
  })
}

function formatWeekRange(weekDates: string[]) {
  const firstDate = parseInputDate(weekDates[0])
  const lastDate = parseInputDate(weekDates[weekDates.length - 1])
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })

  return `${formatter.format(firstDate)} a ${formatter.format(lastDate)}`
}

function formatWeekdayLabel(date: string) {
  return parseInputDate(date).toLocaleDateString('pt-BR', {
    weekday: 'long',
  })
}

function formatShortDateLabel(date: string) {
  return parseInputDate(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}

function getSlotStatus(slot: ScheduleSlot) {
  if (slot.available || !slot.appointment) {
    return {
      label: 'Livre',
      badgeClass: 'bg-cyan-50 text-cyan-700',
      description: 'Horario disponivel para agendamento',
    }
  }

  switch (slot.appointment.status) {
    case 'em_consulta':
      return {
        label: 'Em consulta',
        badgeClass: 'bg-amber-50 text-amber-700',
        description: 'Paciente em atendimento',
      }
    case 'finalizado':
      return {
        label: 'Executada',
        badgeClass: 'bg-emerald-50 text-emerald-700',
        description: 'Consulta encerrada',
      }
    default:
      return {
        label: 'Reservada',
        badgeClass: 'bg-slate-100 text-slate-700',
        description: 'Consulta agendada',
      }
  }
}

function DailyCount({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className={cn('mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl', accent)}>
        <div className="h-2.5 w-2.5 rounded-full bg-current" />
      </div>
      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function DaySummaryCard({
  date,
  data,
  isSelected,
  isToday,
  loading,
  error,
  onClick,
}: {
  date: string
  data?: ScheduleAgendaSlotsResponse
  isSelected: boolean
  isToday: boolean
  loading: boolean
  error: boolean
  onClick: () => void
}) {
  const freeCount = data ? data.slots.filter((slot) => slot.available).length : 0
  const occupiedCount = data ? data.slots.length - freeCount : 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[152px] flex-col justify-between border-b border-slate-200 p-4 text-left transition-colors md:border-b-0 md:border-r',
        isSelected ? 'bg-primary-50' : 'bg-white hover:bg-slate-50',
        !isSelected && isToday && 'bg-cyan-50/40'
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              {formatWeekdayLabel(date)}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatShortDateLabel(date)}</p>
          </div>
          {isToday && (
            <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs text-cyan-700">Hoje</span>
          )}
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-slate-400">Carregando capacidade...</p>
        ) : error ? (
          <p className="mt-5 text-sm text-red-500">Falha ao carregar o dia.</p>
        ) : data?.allowed ? (
          <>
            <p className="mt-5 text-2xl font-semibold text-slate-900">{data.slots.length} vagas</p>
            <p className="mt-1 text-sm text-slate-500">
              {freeCount} livres e {occupiedCount} ocupadas
            </p>
          </>
        ) : (
          <>
            <p className="mt-5 text-lg font-semibold text-slate-700">Nao atende</p>
            <p className="mt-1 text-sm text-slate-500">{data?.reason || 'Dia bloqueado na agenda'}</p>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{data?.enabledShiftCount || 0} turno(s)</span>
        <span>{data?.isHoliday ? 'Feriado' : 'Dia util'}</span>
      </div>
    </button>
  )
}

export function AgendaCalendarView({ agendaId }: { agendaId: string }) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(() => dateToInput(new Date()))
  const [quickModalOpen, setQuickModalOpen] = useState(false)
  const [initialSlot, setInitialSlot] = useState<string | null>(null)

  const month = selectedDate.slice(0, 7)
  const today = dateToInput(new Date())
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate])

  const agendasQuery = useQuery({
    queryKey: ['schedule-agendas'],
    queryFn: () => api.schedule.agendas(),
  })

  const calendarQuery = useQuery({
    queryKey: ['agenda-calendar', agendaId, month],
    queryFn: () => api.schedule.agendaCalendar(agendaId, month),
  })

  const weekQueries = useQueries({
    queries: weekDates.map((date) => ({
      queryKey: ['agenda-slots', agendaId, date],
      queryFn: () => api.schedule.agendaSlots(agendaId, date),
      staleTime: 30_000,
    })),
  })

  const selectedDayIndex = weekDates.findIndex((date) => date === selectedDate)
  const selectedDayQuery = selectedDayIndex >= 0 ? weekQueries[selectedDayIndex] : null
  const selectedDayData = selectedDayQuery?.data
  const selectedAgenda =
    calendarQuery.data?.agenda || agendasQuery.data?.agendas.find((agenda) => agenda.id === agendaId) || null

  const selectedSlots = selectedDayData?.slots || []
  const freeSlotsCount = selectedSlots.filter((slot) => slot.available).length
  const occupiedSlotsCount = selectedSlots.length - freeSlotsCount
  const upcomingAppointments =
    calendarQuery.data?.appointments.filter((appointment) => {
      if (!appointment.scheduledAt) return false
      return appointment.scheduledAt >= new Date().toISOString()
    }) || []

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <AgendaQuickScheduleModal
        agendaId={agendaId}
        open={quickModalOpen}
        date={selectedDate}
        initialSlot={initialSlot}
        onClose={() => {
          setQuickModalOpen(false)
          setInitialSlot(null)
        }}
      />

      <div className="flex flex-col gap-4">
        <Link href="/" className="text-xs text-primary-600 hover:text-primary-700">
          Voltar ao dashboard
        </Link>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                <Stethoscope className="h-6 w-6" />
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Operacao da agenda</p>
                <h1 className="mt-1 text-3xl font-bold text-slate-900">
                  {selectedAgenda?.title || 'Agenda'}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedAgenda?.specialty || 'Carregando especialidade'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="min-w-[260px]">
                <label className="form-label">Agenda</label>
                <select
                  value={agendaId}
                  onChange={(event) => router.push(`/agendas/${event.target.value}`)}
                  className="form-input"
                >
                  {(agendasQuery.data?.agendas || []).map((agenda) => (
                    <option key={agenda.id} value={agenda.id}>
                      {agenda.specialty} - {agenda.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
                  className="btn-secondary p-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
                  {selectedDate.split('-').reverse().join('/')}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
                  className="btn-secondary p-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setSelectedDate(today)} className="btn-secondary">
                  Hoje
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Visao semanal</h2>
            <p className="mt-1 text-sm text-slate-500">
              Semana de {formatWeekRange(weekDates)} com a capacidade consolidada por dia.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/settings" className="btn-secondary">
              <Stethoscope className="h-4 w-4" />
              Editar agenda
            </Link>
            <button
              type="button"
              onClick={() => {
                setInitialSlot(null)
                setQuickModalOpen(true)
              }}
              className="btn-primary"
            >
              <CalendarPlus className="h-4 w-4" />
              Agendar no dia
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-7">
          {weekDates.map((date, index) => (
            <DaySummaryCard
              key={date}
              date={date}
              data={weekQueries[index].data}
              isSelected={selectedDate === date}
              isToday={date === today}
              loading={weekQueries[index].isLoading}
              error={weekQueries[index].isError}
              onClick={() => setSelectedDate(date)}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_320px]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 capitalize">
                Grade do dia
              </h2>
              <p className="mt-1 text-sm text-slate-500">{formatDateHeading(selectedDate)}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedDate(today)}
                className="btn-secondary"
              >
                <CalendarClock className="h-4 w-4" />
                Voltar para hoje
              </button>
            </div>
          </div>

          {!selectedDayQuery || selectedDayQuery.isLoading ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">
              Carregando horarios do dia...
            </div>
          ) : selectedDayQuery.isError ? (
            <div className="px-5 py-12 text-center text-sm text-red-500">
              {selectedDayQuery.error.message}
            </div>
          ) : !selectedDayData?.allowed ? (
            <div className="px-5 py-10">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-sm font-semibold text-amber-800">Dia indisponivel para atendimento</p>
                <p className="mt-1 text-sm text-amber-700">
                  {selectedDayData?.reason || 'A agenda nao libera horarios nesta data.'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-[0.16em] text-slate-400">
                      <th className="px-5 py-4 font-medium">Hora</th>
                      <th className="px-5 py-4 font-medium">Paciente</th>
                      <th className="px-5 py-4 font-medium">Agenda</th>
                      <th className="px-5 py-4 font-medium">Classificacao</th>
                      <th className="px-5 py-4 font-medium">Status</th>
                      <th className="px-5 py-4 text-right font-medium">Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSlots.map((slot) => {
                      const status = getSlotStatus(slot)

                      return (
                        <tr key={slot.isoDateTime} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-5 py-4 align-top">
                            <p className="text-base font-semibold text-slate-900">{slot.label}</p>
                          </td>
                          <td className="px-5 py-4 align-top">
                            <p className="text-sm font-medium text-slate-900">
                              {slot.appointment?.patientName || 'Horario livre'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">{status.description}</p>
                          </td>
                          <td className="px-5 py-4 align-top text-sm text-slate-600">
                            {slot.appointment?.scheduleTitle || selectedAgenda?.title || '-'}
                          </td>
                          <td className="px-5 py-4 align-top text-sm text-slate-600">
                            {slot.appointment?.chiefComplaint || (slot.available ? 'Disponivel' : 'Consulta agendada')}
                          </td>
                          <td className="px-5 py-4 align-top">
                            <span className={cn('rounded-full px-3 py-1 text-xs', status.badgeClass)}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-5 py-4 align-top text-right">
                            {slot.available ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setInitialSlot(slot.isoDateTime)
                                  setQuickModalOpen(true)
                                }}
                                className="btn-secondary"
                              >
                                <CalendarPlus className="h-4 w-4" />
                                Agendar
                              </button>
                            ) : slot.appointment ? (
                              <Link href={`/consultations/${slot.appointment.id}`} className="btn-secondary">
                                <ChevronRight className="h-4 w-4" />
                                Abrir
                              </Link>
                            ) : (
                              <span className="text-sm text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 border-t border-slate-100 px-5 py-4 sm:grid-cols-3 xl:grid-cols-4">
                <DailyCount
                  label="Total"
                  value={selectedSlots.length}
                  accent="bg-slate-100 text-slate-600"
                />
                <DailyCount
                  label="Livres"
                  value={freeSlotsCount}
                  accent="bg-cyan-50 text-cyan-600"
                />
                <DailyCount
                  label="Ocupadas"
                  value={occupiedSlotsCount}
                  accent="bg-emerald-50 text-emerald-600"
                />
                <DailyCount
                  label="Turnos"
                  value={selectedDayData.enabledShiftCount}
                  accent="bg-amber-50 text-amber-600"
                />
              </div>
            </>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Resumo operacional</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Status da agenda</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {selectedAgenda?.status === 'ativa' ? 'Ativa' : 'Inativa'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Vagas por dia</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {selectedAgenda?.maxAppointmentsPerDay || 0} horario(s)
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">No mes</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {calendarQuery.data?.stats.scheduledThisMonthCount || 0} consulta(s)
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Finalizadas</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {calendarQuery.data?.stats.completedConsultationsCount || 0} consulta(s)
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-900">Turnos configurados</h2>
            </div>

            <div className="mt-4 space-y-3">
              {(selectedAgenda?.shifts || []).map((shift) => (
                <div key={shift.id} className="rounded-xl border border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{shift.label}</p>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs',
                        shift.enabled && shift.slots > 0
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      )}
                    >
                      {shift.enabled && shift.slots > 0 ? 'Ativo' : 'Pausado'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {shift.start} - {shift.end} - {shift.slots} vaga(s)
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-primary-600" />
              <h2 className="text-sm font-semibold text-slate-900">Proximos agendamentos</h2>
            </div>

            {upcomingAppointments.length ? (
              <div className="mt-4 space-y-3">
                {upcomingAppointments.slice(0, 5).map((appointment) => (
                  <Link
                    key={appointment.id}
                    href={`/consultations/${appointment.id}`}
                    className="block rounded-xl border border-slate-200 px-4 py-3 transition-colors hover:border-primary-300 hover:bg-primary-50/40"
                  >
                    <p className="text-sm font-semibold text-slate-900">{appointment.patientName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {appointment.chiefComplaint || 'Consulta agendada'}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {formatDateTimeLabel(appointment.scheduledAt)}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Nenhum agendamento futuro para esta agenda.</p>
            )}
          </section>
        </div>
      </div>

      {agendasQuery.isLoading && <div className="text-sm text-slate-400">Carregando agenda...</div>}
      {agendasQuery.isError && (
        <div className="text-sm text-red-500">{agendasQuery.error.message}</div>
      )}
      {calendarQuery.isError && (
        <div className="text-sm text-red-500">{calendarQuery.error.message}</div>
      )}
    </div>
  )
}
