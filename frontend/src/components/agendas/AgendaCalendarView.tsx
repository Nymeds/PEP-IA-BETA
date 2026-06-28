'use client'

import Link from 'next/link'
import { startTransition, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Stethoscope,
} from 'lucide-react'
import { api } from '@/services/api'
import { CalendarAppointment } from '@/types'
import { cn } from '../shared/utils'
import {
  buildMonthGrid,
  dateToInput,
  formatDateTimeLabel,
  formatMonthHeading,
  monthToInput,
  shiftMonth,
  WEEKDAY_LABELS,
} from '../dashboard/calendar-utils'
import { AgendaQuickScheduleModal } from './AgendaQuickScheduleModal'

export function AgendaCalendarView({ agendaId }: { agendaId: string }) {
  const [month, setMonth] = useState(() => monthToInput(new Date()))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [quickModalOpen, setQuickModalOpen] = useState(false)

  const calendarQuery = useQuery({
    queryKey: ['agenda-calendar', agendaId, month],
    queryFn: () => api.schedule.agendaCalendar(agendaId, month),
  })

  const appointmentsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarAppointment[]>()
    for (const appointment of calendarQuery.data?.appointments || []) {
      const key = appointment.localDateTime?.slice(0, 10)
      if (!key) continue
      const list = grouped.get(key) || []
      list.push(appointment)
      grouped.set(key, list)
    }
    return grouped
  }, [calendarQuery.data?.appointments])

  const monthDays = useMemo(() => buildMonthGrid(month), [month])
  const agenda = calendarQuery.data?.agenda
  const isActive = agenda?.status === 'ativa'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <AgendaQuickScheduleModal
        agendaId={agendaId}
        open={quickModalOpen}
        date={selectedDate}
        onClose={() => setQuickModalOpen(false)}
      />

      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <Link href="/" className="text-xs text-primary-600 hover:text-primary-700">
            Voltar ao dashboard
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <h1 className="text-3xl font-bold text-slate-900">
              {agenda?.title || 'Agenda'}
            </h1>
            {agenda && (
              <span
                className={
                  isActive
                    ? 'px-2.5 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700'
                    : 'px-2.5 py-1 rounded-full text-xs bg-slate-100 text-slate-500'
                }
              >
                {isActive ? 'Ativa' : 'Inativa'}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl">
            {agenda?.specialty
              ? `${agenda.specialty}. Clique em um dia para abrir o helper de agendamento rapido.`
              : 'Carregando dados da agenda...'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/settings" className="btn-secondary">
            <Stethoscope className="w-4 h-4" />
            Editar agenda
          </Link>
          <button
            onClick={() => {
              setSelectedDate(dateToInput(new Date()))
              setQuickModalOpen(true)
            }}
            className="btn-primary"
          >
            <CalendarPlus className="w-4 h-4" />
            Agendar neste mes
          </button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.35fr_0.65fr] gap-6">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 capitalize">
                {formatMonthHeading(month)}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Dias e horarios respeitam turnos, feriados e o status ativo da agenda.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => startTransition(() => setMonth(shiftMonth(month, -1)))}
                className="btn-secondary p-2"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => startTransition(() => setMonth(monthToInput(new Date())))}
                className="btn-secondary"
              >
                Hoje
              </button>
              <button
                onClick={() => startTransition(() => setMonth(shiftMonth(month, 1)))}
                className="btn-secondary p-2"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="grid grid-cols-7 gap-2 mb-2">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="px-2 py-2 text-xs font-semibold text-slate-400 uppercase tracking-[0.16em]"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {monthDays.map((day) => {
                const appointments = appointmentsByDate.get(day.key) || []
                return (
                  <button
                    key={day.key}
                    onClick={() => {
                      setSelectedDate(day.key)
                      setQuickModalOpen(true)
                    }}
                    className={cn(
                      'min-h-[126px] rounded-2xl border p-3 text-left transition-colors',
                      day.isCurrentMonth
                        ? 'bg-white border-slate-200 hover:border-primary-300 hover:bg-primary-50/30'
                        : 'bg-slate-50 border-slate-100 text-slate-300',
                      day.isToday && 'border-primary-500 shadow-sm'
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={cn(
                          'inline-flex w-8 h-8 rounded-xl items-center justify-center text-sm font-semibold',
                          day.isToday
                            ? 'bg-primary-600 text-white'
                            : day.isCurrentMonth
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-slate-100 text-slate-300'
                        )}
                      >
                        {day.date.getDate()}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {appointments.length ? `${appointments.length} ag.` : 'Livre'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {appointments.slice(0, 3).map((appointment) => (
                        <Link
                          key={appointment.id}
                          href={`/consultations/${appointment.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="block rounded-xl bg-slate-50 border border-slate-200 px-2.5 py-2 hover:border-primary-300 hover:bg-primary-50 transition-colors"
                        >
                          <p className="text-xs font-medium text-slate-800 truncate">
                            {appointment.patientName}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {appointment.localDateTime?.slice(11, 16)}{' '}
                            {appointment.chiefComplaint ? `· ${appointment.chiefComplaint}` : ''}
                          </p>
                        </Link>
                      ))}
                      {appointments.length > 3 && (
                        <p className="text-[11px] text-primary-600 font-medium">
                          +{appointments.length - 3} agendamento(s)
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Resumo operacional</h2>
            <div className="space-y-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Turnos ativos</p>
                <p className="text-sm font-semibold text-slate-900 mt-1">
                  {agenda?.enabledShiftCount ?? 0} turno(s)
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Dias por semana</p>
                <p className="text-sm font-semibold text-slate-900 mt-1">
                  {agenda?.activeWeekDays.length ?? 0} dia(s)
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Agendadas no mes</p>
                <p className="text-sm font-semibold text-slate-900 mt-1">
                  {calendarQuery.data?.stats.scheduledThisMonthCount ?? 0} consulta(s)
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Finalizadas</p>
                <p className="text-sm font-semibold text-slate-900 mt-1">
                  {calendarQuery.data?.stats.completedConsultationsCount ?? 0} consulta(s)
                </p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Status da agenda</h2>
            <div className="space-y-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <CircleCheck className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm font-medium text-slate-800">Agenda ativa</p>
                </div>
                <p className="text-xs text-slate-500">
                  {isActive
                    ? 'Esta agenda pode receber novos agendamentos.'
                    : 'Enquanto estiver inativa, nenhum novo horario sera liberado.'}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock3 className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-medium text-slate-800">Consultas em espera</p>
                </div>
                <p className="text-xs text-slate-500">
                  {calendarQuery.data?.stats.waitingConsultationsCount ?? 0} consulta(s) aguardando inicio.
                </p>
              </div>
            </div>
          </div>

          {calendarQuery.data?.appointments?.length ? (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Proximos agendamentos</h2>
              <div className="space-y-2">
                {calendarQuery.data.appointments.slice(0, 5).map((appointment) => (
                  <Link
                    key={appointment.id}
                    href={`/consultations/${appointment.id}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 hover:border-primary-300 hover:bg-primary-50/40 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{appointment.patientName}</p>
                      <p className="text-xs text-slate-500">
                        {appointment.chiefComplaint || 'Consulta agendada'}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">
                      {formatDateTimeLabel(appointment.scheduledAt)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {calendarQuery.isLoading && (
        <div className="text-sm text-slate-400 mt-4">Carregando agenda...</div>
      )}
      {calendarQuery.isError && (
        <div className="text-sm text-red-500 mt-4">{calendarQuery.error.message}</div>
      )}
    </div>
  )
}
