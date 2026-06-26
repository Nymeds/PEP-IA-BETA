'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Users, ClipboardList, CalendarDays, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { format } from '../shared/utils'

export function DashboardContent() {
  const { data: patients = [] } = useQuery({
    queryKey: ['patients'],
    queryFn: api.patients.list,
  })

  const allConsultations = patients.flatMap((p) => p.consultations || [])
  const today = new Date().toDateString()
  const todayConsultations = allConsultations.filter(
    (c) => new Date(c.createdAt).toDateString() === today
  )

  const stats = [
    {
      label: 'Total de Pacientes',
      value: patients.length,
      icon: Users,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Consultas Realizadas',
      value: allConsultations.length,
      icon: ClipboardList,
      color: 'text-teal-600 bg-teal-50',
    },
    {
      label: 'Consultas Hoje',
      value: todayConsultations.length,
      icon: CalendarDays,
      color: 'text-violet-600 bg-violet-50',
    },
    {
      label: 'Com IA Ativa',
      value: allConsultations.filter((c) => c.status === 'completed').length,
      icon: TrendingUp,
      color: 'text-amber-600 bg-amber-50',
    },
  ]

  const recentPatients = [...patients]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4">
            <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Pacientes Recentes</h2>
          <Link href="/patients" className="text-xs text-primary-600 hover:text-primary-700">
            Ver todos →
          </Link>
        </div>
        {recentPatients.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Nenhum paciente cadastrado</p>
            <Link href="/patients/new" className="btn-primary mt-4 text-xs">
              Cadastrar primeiro paciente
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recentPatients.map((p) => {
              const lastConsultation = p.consultations?.[0]
              return (
                <Link
                  key={p.id}
                  href={`/patients/${p.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 font-semibold text-sm">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">
                        {lastConsultation
                          ? `Última consulta: ${format(lastConsultation.createdAt)}`
                          : 'Sem consultas'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">{p.phone || '—'}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
