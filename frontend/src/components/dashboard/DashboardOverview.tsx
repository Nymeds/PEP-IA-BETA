'use client'

import Link from 'next/link'
import { startTransition, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Clock3,
  Stethoscope,
  Users,
} from 'lucide-react'
import { api } from '@/services/api'
import { useSession } from '@/components/providers/SessionProvider'
import { formatDateTimeLabel, formatMonthHeading, monthToInput, shiftMonth } from './calendar-utils'

export function DashboardOverview() {
  const { user } = useSession()
  const [month, setMonth] = useState(() => monthToInput(new Date()))

  const dashboardQuery = useQuery({
    queryKey: ['schedule-dashboard', month],
    queryFn: () => api.schedule.dashboard(month),
  })

  const stats = [
    {
      label: 'Pacientes',
      value: dashboardQuery.data?.stats.patientsCount ?? 0,
      icon: Users,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Consultas',
      value: dashboardQuery.data?.stats.consultationsCount ?? 0,
      icon: ClipboardList,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Em espera',
      value: dashboardQuery.data?.stats.waitingConsultationsCount ?? 0,
      icon: Clock3,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'Em consulta',
      value: dashboardQuery.data?.stats.inProgressConsultationsCount ?? 0,
      icon: Activity,
      color: 'text-cyan-600 bg-cyan-50',
    },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-primary-600 mb-2">Dashboard medico</p>
          <h1 className="text-3xl font-bold text-slate-900">
            Bem-vindo, {user?.suggestedName || user?.name}
          </h1>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl">
            Cada agenda representa uma especialidade. Abra um card para ver o calendario do mes e agendar pacientes apenas em horarios validos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/settings" className="btn-secondary">
            <Stethoscope className="w-4 h-4" />
            Gerenciar agendas
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4">
            <div className={`w-11 h-11 rounded-2xl ${color} flex items-center justify-center mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 capitalize">
              Agendas de {formatMonthHeading(month)}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Ao clicar em uma agenda voce vai direto para o calendario mensal daquela especialidade.
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

        {!dashboardQuery.data?.agendas.length ? (
          <div className="p-12 text-center">
            <CalendarRange className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-sm text-slate-500">Nenhuma agenda cadastrada ainda.</p>
            <p className="text-xs text-slate-400 mt-2">
              Crie ao menos uma agenda por especialidade para liberar o fluxo de agendamento.
            </p>
            <Link href="/settings" className="btn-primary mt-5">
              <Stethoscope className="w-4 h-4" />
              Criar agenda
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-5 p-5">
            {dashboardQuery.data.agendas.map((agenda) => {
              const isActive = agenda.status === 'ativa'
              return (
                <Link
                  key={agenda.id}
                  href={`/agendas/${agenda.id}`}
                  className="rounded-3xl border border-slate-200 bg-white p-5 hover:border-primary-300 hover:bg-primary-50/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-2">
                        {agenda.specialty}
                      </p>
                      <h3 className="text-xl font-semibold text-slate-900">{agenda.title}</h3>
                    </div>
                    <span
                      className={
                        isActive
                          ? 'px-2.5 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700'
                          : 'px-2.5 py-1 rounded-full text-xs bg-slate-100 text-slate-500'
                      }
                    >
                      {isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-400">No mes</p>
                      <p className="text-lg font-semibold text-slate-900 mt-1">
                        {agenda.appointmentsThisMonthCount}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Hoje</p>
                      <p className="text-lg font-semibold text-slate-900 mt-1">
                        {agenda.todayAppointmentsCount}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Proxima consulta</p>
                    {agenda.nextAppointment ? (
                      <>
                        <p className="text-sm font-semibold text-slate-900 mt-1">
                          {agenda.nextAppointment.patientName}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatDateTimeLabel(agenda.nextAppointment.scheduledAt)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500 mt-1">Nenhum horario reservado.</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 mt-4">
                    <span>{agenda.enabledShiftCount} turno(s) ativo(s)</span>
                    <span>{agenda.activeWeekDays.length} dia(s) por semana</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CircleCheck className="w-4 h-4 text-emerald-600" />
            <p className="text-sm font-semibold text-slate-800">Finalizadas</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {dashboardQuery.data?.stats.completedConsultationsCount ?? 0}
          </p>
          <p className="text-xs text-slate-500 mt-1">Consultas encerradas no sistema</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CalendarRange className="w-4 h-4 text-primary-600" />
            <p className="text-sm font-semibold text-slate-800">Agenda de hoje</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {dashboardQuery.data?.stats.todayAppointmentsCount ?? 0}
          </p>
          <p className="text-xs text-slate-500 mt-1">Horarios ocupados no dia atual</p>
        </div>
      </div>

      {dashboardQuery.isLoading && (
        <div className="text-sm text-slate-400 mt-4">Carregando agendas...</div>
      )}
      {dashboardQuery.isError && (
        <div className="text-sm text-red-500 mt-4">{dashboardQuery.error.message}</div>
      )}
    </div>
  )
}
