'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Settings2,
  Stethoscope,
  UserX,
  XCircle,
} from 'lucide-react'
import { api } from '@/services/api'
import { AppointmentOperation, CalendarAppointment, ScheduleAgendaSlotsResponse, ScheduleSlot } from '@/types'
import { formatDateHeading, dateToInput } from '../dashboard/calendar-utils'
import { cn } from '../shared/utils'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/AsyncState'
import { AgendaQuickScheduleModal } from './AgendaQuickScheduleModal'
import { AppointmentOperationDialog } from './AppointmentOperationDialog'

type SlotFilter = 'all' | 'free' | 'reserved' | 'in_progress' | 'completed'

const FILTERS: Array<{ id: SlotFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'free', label: 'Livres' },
  { id: 'reserved', label: 'Reservados' },
  { id: 'in_progress', label: 'Em consulta' },
  { id: 'completed', label: 'Finalizados' },
]

function parseInputDate(input: string) {
  return new Date(`${input}T00:00:00`)
}

function shiftDate(input: string, offset: number) {
  const date = parseInputDate(input)
  date.setDate(date.getDate() + offset)
  return dateToInput(date)
}

function getWeekDates(selectedDate: string) {
  const start = parseInputDate(selectedDate)
  const day = start.getDay()
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return dateToInput(date)
  })
}

function formatWeekRange(dates: string[]) {
  const format = (date: string) => parseInputDate(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${format(dates[0])} a ${format(dates[dates.length - 1])}`
}

function appointmentStatus(status?: string | null) {
  if (status === 'em_consulta' || status === 'active') return 'in_progress'
  if (status === 'finalizado' || status === 'completed') return 'completed'
  if (status === 'cancelado' || status === 'canceled') return 'canceled'
  if (status === 'faltou' || status === 'no_show') return 'no_show'
  return 'reserved'
}

function getSlotStatus(slot: ScheduleSlot) {
  if (slot.available || !slot.appointment) {
    return { label: 'Livre', cls: 'bg-cyan-50 text-cyan-700', description: 'Disponível para agendamento' }
  }

  const status = appointmentStatus(slot.appointment.status)
  if (status === 'in_progress') return { label: 'Em consulta', cls: 'bg-amber-50 text-amber-700', description: 'Atendimento em andamento' }
  if (status === 'completed') return { label: 'Finalizada', cls: 'bg-emerald-50 text-emerald-700', description: 'Atendimento encerrado' }
  if (status === 'no_show') return { label: 'Faltou', cls: 'bg-red-50 text-red-700', description: 'Ausência registrada' }
  return { label: 'Reservada', cls: 'bg-slate-100 text-slate-700', description: 'Consulta agendada' }
}

function matchesFilter(slot: ScheduleSlot, filter: SlotFilter) {
  if (filter === 'all') return true
  if (filter === 'free') return slot.available
  if (!slot.appointment || slot.available) return false
  return appointmentStatus(slot.appointment.status) === filter
}

function DayButton({
  date,
  data,
  selected,
  today,
  loading,
  onClick,
}: {
  date: string
  data?: ScheduleAgendaSlotsResponse
  selected: boolean
  today: boolean
  loading: boolean
  onClick: () => void
}) {
  const free = data?.slots.filter((slot) => slot.available).length || 0
  const occupied = (data?.slots.length || 0) - free
  const dateValue = parseInputDate(date)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-w-[132px] flex-1 border-r border-slate-200 px-3 py-2.5 text-left transition-colors last:border-r-0',
        selected ? 'bg-primary-50 shadow-[inset_0_-2px_0_#2563eb]' : 'bg-white hover:bg-slate-50'
      )}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase text-slate-500">
          {dateValue.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
        </span>
        {today ? <span className="text-[10px] font-semibold text-primary-700">Hoje</span> : null}
      </div>
      <p className="mt-0.5 text-sm font-semibold text-slate-950">
        {dateValue.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
      </p>
      {loading ? (
        <p className="mt-2 text-[11px] text-slate-400">Carregando...</p>
      ) : data?.allowed ? (
        <p className="mt-2 text-[11px] text-slate-500"><strong className="text-cyan-700">{free}</strong> livres · <strong className="text-slate-700">{occupied}</strong> ocupados</p>
      ) : (
        <p className="mt-2 text-[11px] font-medium text-slate-400">Sem atendimento</p>
      )}
    </button>
  )
}

export function AgendaCalendarView({ agendaId }: { agendaId: string }) {
  const router = useRouter()
  const today = dateToInput(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [filter, setFilter] = useState<SlotFilter>('all')
  const [quickModalOpen, setQuickModalOpen] = useState(false)
  const [initialSlot, setInitialSlot] = useState<string | null>(null)
  const [operation, setOperation] = useState<AppointmentOperation | null>(null)
  const [operationAppointment, setOperationAppointment] = useState<CalendarAppointment | null>(null)

  const month = selectedDate.slice(0, 7)
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate])
  const agendasQuery = useQuery({ queryKey: ['schedule-agendas'], queryFn: () => api.schedule.agendas() })
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

  const selectedDayIndex = weekDates.indexOf(selectedDate)
  const selectedDayQuery = selectedDayIndex >= 0 ? weekQueries[selectedDayIndex] : null
  const selectedDayData = selectedDayQuery?.data
  const selectedAgenda = calendarQuery.data?.agenda || agendasQuery.data?.agendas.find((agenda) => agenda.id === agendaId)
  const selectedSlots = selectedDayData?.slots || []
  const visibleSlots = selectedSlots.filter((slot) => matchesFilter(slot, filter))
  const freeCount = selectedSlots.filter((slot) => slot.available).length
  const occupiedCount = selectedSlots.length - freeCount
  const upcomingAppointments = (calendarQuery.data?.appointments || []).filter(
    (item) => item.scheduledAt && item.scheduledAt >= new Date().toISOString() && !['cancelado', 'faltou'].includes(item.status)
  )

  const openOperation = (appointment: CalendarAppointment, nextOperation: AppointmentOperation) => {
    setOperationAppointment(appointment)
    setOperation(nextOperation)
  }

  return (
    <div className="flex min-h-0 w-full flex-col gap-3 p-3 lg:p-4">
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
      <AppointmentOperationDialog
        appointment={operationAppointment}
        operation={operation}
        onClose={() => {
          setOperation(null)
          setOperationAppointment(null)
        }}
      />

      <section className="sticky top-0 z-20 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Stethoscope className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-950">{selectedAgenda?.title || 'Agenda'}</p>
            <p className="truncate text-xs text-slate-500">{selectedAgenda?.specialty || 'Carregando especialidade'}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1 sm:flex-none">
            <label htmlFor="agenda-select" className="form-label mb-1">Agenda</label>
            <select id="agenda-select" value={agendaId} onChange={(event) => router.push(`/agendas/${event.target.value}`)} className="form-input py-1.5">
              {(agendasQuery.data?.agendas || []).map((agenda) => <option key={agenda.id} value={agenda.id}>{agenda.specialty} · {agenda.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="agenda-date" className="form-label mb-1">Data</label>
            <input id="agenda-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="form-input w-auto py-1.5" />
          </div>
          <Button size="icon" onClick={() => setSelectedDate(today)} title="Voltar para hoje" aria-label="Voltar para hoje">
            <CalendarClock className="h-4 w-4" />
          </Button>
          <Link href="/settings" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" title="Editar agenda" aria-label="Editar agenda">
            <Settings2 className="h-4 w-4" />
          </Link>
          <Button variant="primary" onClick={() => setQuickModalOpen(true)}>
            <CalendarPlus className="h-4 w-4" />
            Agendar
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <div>
            <p className="text-xs font-semibold text-slate-800">Semana de {formatWeekRange(weekDates)}</p>
            <p className="text-[11px] text-slate-500">Selecione um dia para atualizar a grade.</p>
          </div>
          <div className="flex gap-1">
            <Button size="icon" className="h-8 w-8" onClick={() => setSelectedDate(shiftDate(selectedDate, -7))} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="icon" className="h-8 w-8" onClick={() => setSelectedDate(shiftDate(selectedDate, 7))} aria-label="Próxima semana"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="flex overflow-x-auto">
          {weekDates.map((date, index) => (
            <DayButton key={date} date={date} data={weekQueries[index].data} selected={selectedDate === date} today={date === today} loading={weekQueries[index].isLoading} onClick={() => setSelectedDate(date)} />
          ))}
        </div>
      </section>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-sm font-semibold text-slate-950">Grade do dia</h1>
              <p className="text-xs text-slate-500">{formatDateHeading(selectedDate)}</p>
            </div>
            {selectedDayData?.allowed ? (
              <div className="hidden items-center gap-1.5 text-[11px] sm:flex">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{selectedSlots.length} horários</span>
                <span className="rounded-full bg-cyan-50 px-2 py-1 text-cyan-700">{freeCount} livres</span>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{occupiedCount} ocupados</span>
              </div>
            ) : null}
          </div>

          <div className="flex max-w-full overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-0.5" aria-label="Filtrar horários">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn('whitespace-nowrap rounded px-2.5 py-1.5 text-xs font-medium', filter === item.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
                aria-pressed={filter === item.id}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {!selectedDayQuery || selectedDayQuery.isLoading ? (
          <LoadingState label="Carregando horários do dia..." />
        ) : selectedDayQuery.isError ? (
          <ErrorState message={selectedDayQuery.error.message} onRetry={() => void selectedDayQuery.refetch()} />
        ) : !selectedDayData?.allowed ? (
          <EmptyState title="Dia indisponível para atendimento" description={selectedDayData?.reason || 'A agenda não libera horários nesta data.'} />
        ) : !visibleSlots.length ? (
          <EmptyState title="Nenhum horário neste filtro" description="Escolha outro status para visualizar a grade do dia." />
        ) : (
          <div className="max-h-[calc(100dvh-300px)] min-h-[420px] overflow-auto">
            <table className="min-w-[760px] w-full table-fixed">
              <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                <tr className="h-9 text-left text-[10px] uppercase tracking-[0.12em] text-slate-400">
                  <th className="w-20 px-3 font-medium">Hora</th>
                  <th className="w-[32%] px-3 font-medium">Paciente</th>
                  <th className="px-3 font-medium">Classificação</th>
                  <th className="w-28 px-3 font-medium">Status</th>
                  <th className="w-40 px-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleSlots.map((slot) => {
                  const status = getSlotStatus(slot)
                  const appointment = slot.appointment
                  const canManage = appointment && appointmentStatus(appointment.status) === 'reserved'
                  return (
                    <tr key={slot.isoDateTime} className="h-12 border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-3 py-1.5 text-sm font-semibold text-slate-950">{slot.label}</td>
                      <td className="px-3 py-1.5">
                        <p className="truncate text-sm font-medium text-slate-900">{appointment?.patientName || 'Horário livre'}</p>
                        <p className="truncate text-[11px] text-slate-500">{status.description}</p>
                      </td>
                      <td className="truncate px-3 py-1.5 text-sm text-slate-600">{appointment?.chiefComplaint || (slot.available ? 'Disponível' : 'Consulta agendada')}</td>
                      <td className="px-3 py-1.5"><span className={cn('rounded-full px-2 py-1 text-[11px] font-medium', status.cls)}>{status.label}</span></td>
                      <td className="px-3 py-1.5">
                        <div className="flex justify-end gap-1">
                          {slot.available ? (
                            <Button size="sm" onClick={() => { setInitialSlot(slot.isoDateTime); setQuickModalOpen(true) }}>
                              <CalendarPlus className="h-3.5 w-3.5" /> Agendar
                            </Button>
                          ) : appointment ? (
                            <>
                              <Link href={`/consultations/${appointment.id}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-white" title="Abrir consulta" aria-label={`Abrir consulta de ${appointment.patientName}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                              {canManage ? (
                                <>
                                  <Button size="icon" className="h-8 w-8" onClick={() => openOperation(appointment, 'reschedule')} title="Remarcar" aria-label={`Remarcar consulta de ${appointment.patientName}`}><CalendarClock className="h-3.5 w-3.5" /></Button>
                                  <Button size="icon" className="h-8 w-8" onClick={() => openOperation(appointment, 'no_show')} title="Registrar falta" aria-label={`Registrar falta de ${appointment.patientName}`}><UserX className="h-3.5 w-3.5" /></Button>
                                  <Button size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => openOperation(appointment, 'cancel')} title="Cancelar" aria-label={`Cancelar consulta de ${appointment.patientName}`}><XCircle className="h-3.5 w-3.5" /></Button>
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <details className="border-t border-slate-200 bg-slate-50/70">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100">
            <span>Resumo operacional · {selectedAgenda?.status === 'ativa' ? 'Agenda ativa' : 'Agenda inativa'} · {calendarQuery.data?.stats.scheduledThisMonthCount || 0} no mês</span>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </summary>
          <div className="grid gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white px-4 py-2.5"><p className="text-[10px] uppercase text-slate-400">Capacidade diária</p><p className="mt-0.5 text-sm font-semibold text-slate-900">{selectedAgenda?.maxAppointmentsPerDay || 0} horários</p></div>
            <div className="bg-white px-4 py-2.5"><p className="text-[10px] uppercase text-slate-400">Finalizadas</p><p className="mt-0.5 text-sm font-semibold text-slate-900">{calendarQuery.data?.stats.completedConsultationsCount || 0}</p></div>
            <div className="bg-white px-4 py-2.5"><p className="text-[10px] uppercase text-slate-400">Turnos</p><p className="mt-0.5 text-sm font-semibold text-slate-900">{(selectedAgenda?.shifts || []).filter((shift) => shift.enabled).map((shift) => shift.label).join(', ') || 'Nenhum'}</p></div>
            <div className="bg-white px-4 py-2.5"><p className="text-[10px] uppercase text-slate-400">Próxima consulta</p><p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{upcomingAppointments[0]?.patientName || 'Nenhuma agendada'}</p></div>
          </div>
        </details>
      </section>

      {agendasQuery.isError ? <ErrorState message={agendasQuery.error.message} onRetry={() => void agendasQuery.refetch()} /> : null}
      {calendarQuery.isError ? <ErrorState message={calendarQuery.error.message} onRetry={() => void calendarQuery.refetch()} /> : null}
    </div>
  )
}
