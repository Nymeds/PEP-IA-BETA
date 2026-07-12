'use client'

import Link from 'next/link'
import { startTransition, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  ExternalLink,
  Settings2,
  Users,
} from 'lucide-react'
import { api } from '@/services/api'
import { useSession } from '@/components/providers/SessionProvider'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/AsyncState'
import { formatDateTimeLabel, formatMonthHeading, monthToInput, shiftMonth } from './calendar-utils'

export function DashboardOverview() {
  const { user } = useSession()
  const [month, setMonth] = useState(() => monthToInput(new Date()))
  const dashboardQuery = useQuery({
    queryKey: ['schedule-dashboard', month],
    queryFn: () => api.schedule.dashboard(month),
  })

  const stats = [
    { label: 'Pacientes', value: dashboardQuery.data?.stats.patientsCount ?? 0, icon: Users, cls: 'text-blue-700 bg-blue-50' },
    { label: 'Consultas', value: dashboardQuery.data?.stats.consultationsCount ?? 0, icon: ClipboardList, cls: 'text-emerald-700 bg-emerald-50' },
    { label: 'Em espera', value: dashboardQuery.data?.stats.waitingConsultationsCount ?? 0, icon: Clock3, cls: 'text-amber-700 bg-amber-50' },
    { label: 'Em consulta', value: dashboardQuery.data?.stats.inProgressConsultationsCount ?? 0, icon: Activity, cls: 'text-cyan-700 bg-cyan-50' },
    { label: 'Hoje', value: dashboardQuery.data?.stats.todayAppointmentsCount ?? 0, icon: CalendarRange, cls: 'text-primary-700 bg-primary-50' },
  ]

  return (
    <div className="mx-auto w-full max-w-7xl p-4 lg:p-6">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Operação clínica</p>
          <h1 className="mt-0.5 text-xl font-semibold text-slate-950">Olá, {user?.suggestedName || user?.name}</h1>
        </div>
        <Link href="/settings" className="btn-secondary justify-center"><Settings2 className="h-4 w-4" /> Gerenciar agendas</Link>
      </header>

      <section className="mb-4 grid overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-3 xl:grid-cols-5">
        {stats.map(({ label, value, icon: Icon, cls }, index) => (
          <div key={label} className={`flex items-center gap-3 px-4 py-3 ${index ? 'border-t border-slate-200 sm:border-l sm:border-t-0' : ''}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${cls}`}><Icon className="h-4 w-4" /></div>
            <div><p className="text-lg font-semibold text-slate-950">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-semibold text-slate-950">Agendas de {formatMonthHeading(month)}</h2><p className="mt-0.5 text-xs text-slate-500">Capacidade, movimento e próxima consulta por especialidade.</p></div>
          <div className="flex gap-1">
            <Button size="icon" className="h-8 w-8" onClick={() => startTransition(() => setMonth(shiftMonth(month, -1)))} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" onClick={() => startTransition(() => setMonth(monthToInput(new Date())))}>Mês atual</Button>
            <Button size="icon" className="h-8 w-8" onClick={() => startTransition(() => setMonth(shiftMonth(month, 1)))} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        {dashboardQuery.isLoading ? <LoadingState label="Carregando agendas..." /> : dashboardQuery.isError ? (
          <ErrorState message={dashboardQuery.error.message} onRetry={() => void dashboardQuery.refetch()} />
        ) : !dashboardQuery.data?.agendas.length ? (
          <EmptyState title="Nenhuma agenda cadastrada" description="Crie uma agenda para liberar agendamento e atendimento." action={<Link href="/settings" className="btn-primary">Criar agenda</Link>} />
        ) : (
          <div className="divide-y divide-slate-100">
            {dashboardQuery.data.agendas.map((agenda) => (
              <Link key={agenda.id} href={`/agendas/${agenda.id}`} className="grid gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:grid-cols-[minmax(180px,1.4fr)_90px_90px_minmax(180px,1fr)_36px] sm:items-center">
                <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-slate-950">{agenda.title}</p><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${agenda.status === 'ativa' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{agenda.status === 'ativa' ? 'Ativa' : 'Inativa'}</span></div><p className="mt-0.5 truncate text-xs text-slate-500">{agenda.specialty} · {agenda.enabledShiftCount} turno(s)</p></div>
                <div><p className="text-[10px] uppercase text-slate-400">No mês</p><p className="text-sm font-semibold text-slate-900">{agenda.appointmentsThisMonthCount}</p></div>
                <div><p className="text-[10px] uppercase text-slate-400">Hoje</p><p className="text-sm font-semibold text-slate-900">{agenda.todayAppointmentsCount}</p></div>
                <div className="min-w-0"><p className="text-[10px] uppercase text-slate-400">Próxima consulta</p><p className="truncate text-sm font-medium text-slate-800">{agenda.nextAppointment?.patientName || 'Nenhuma'}</p>{agenda.nextAppointment ? <p className="text-[11px] text-slate-500">{formatDateTimeLabel(agenda.nextAppointment.scheduledAt)}</p> : null}</div>
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
