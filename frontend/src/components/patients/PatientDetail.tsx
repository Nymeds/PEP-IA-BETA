'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { ArrowLeft, Stethoscope, Pencil, Trash2, CalendarClock, Sparkles, Loader2, AlertTriangle, Pill, Activity } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, calcAge } from '../shared/utils'

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Em espera', cls: 'bg-blue-50 text-blue-600' },
  em_espera: { label: 'Em espera', cls: 'bg-blue-50 text-blue-600' },
  active: { label: 'Em consulta', cls: 'bg-amber-50 text-amber-600' },
  em_consulta: { label: 'Em consulta', cls: 'bg-amber-50 text-amber-600' },
  finalizado: { label: 'Finalizada', cls: 'bg-green-50 text-green-600' },
  completed: { label: 'Concluída', cls: 'bg-green-50 text-green-600' },
}

export function PatientDetail({ patientId }: { patientId: string }) {
  const router = useRouter()
  const qc = useQueryClient()

  const { data: patient, isLoading } = useQuery({
    queryKey: ['patients', patientId],
    queryFn: () => api.patients.get(patientId),
  })


  // Agenda uma consulta para data futura (não entra no atendimento agora)

  const deletePatient = useMutation({
    mutationFn: () => api.patients.delete(patientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] })
      router.push('/patients')
    },
  })

  // Resumo do paciente gerado pela IA com base em todos os atendimentos
  const summary = useMutation({
    mutationFn: () => api.patients.summary(patientId),
  })

  if (isLoading) return <div className="p-6 text-slate-400">Carregando...</div>
  if (!patient) return <div className="p-6 text-slate-400">Paciente não encontrado</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/patients" className="btn-secondary p-2">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">{patient.name}</h1>
          <p className="text-sm text-slate-500">
            {calcAge(patient.birthDate)} {patient.sex ? `· ${patient.sex}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/patients/${patientId}/edit`} className="btn-secondary">
            <Pencil className="w-4 h-4" /> Editar
          </Link>
          <button
            onClick={() => {
              if (confirm('Excluir este paciente e todas as suas consultas?'))
                deletePatient.mutate()
            }}
            className="btn-secondary text-red-600 border-red-100 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => summary.mutate()}
            disabled={summary.isPending}
            className="btn-secondary"
            title="Resumo do paciente gerado pela IA"
          >
            {summary.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Resumo IA
          </button>
          <Link href="/" className="btn-primary">
            <CalendarClock className="w-4 h-4" /> Ir para agendas
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="form-label">Telefone</p>
          <p className="text-sm text-slate-800">{patient.phone || '—'}</p>
        </div>
        <div className="card p-4">
          <p className="form-label">CPF</p>
          <p className="text-sm text-slate-800">{patient.cpf || '—'}</p>
        </div>
        <div className="card p-4">
          <p className="form-label">Tipo Sanguíneo</p>
          <p className="text-sm text-slate-800">{patient.bloodType || '—'}</p>
        </div>
      </div>

      {(patient.allergies || patient.chronicDiseases) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {patient.allergies && (
            <div className="card p-4 border-l-4 border-l-red-300">
              <p className="form-label text-red-600">Alergias</p>
              <p className="text-sm text-slate-800">{patient.allergies}</p>
            </div>
          )}
          {patient.chronicDiseases && (
            <div className="card p-4 border-l-4 border-l-amber-300">
              <p className="form-label text-amber-600">Doenças Crônicas</p>
              <p className="text-sm text-slate-800">{patient.chronicDiseases}</p>
            </div>
          )}
        </div>
      )}

      {(summary.isPending || summary.data) && (
        <div className="card p-5 mb-6 border-l-4 border-l-primary-400">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary-500" />
            <h2 className="text-sm font-semibold text-slate-800">Resumo do Paciente (IA)</h2>
            {summary.data?.consultationCount != null && (
              <span className="text-xs text-slate-400">· {summary.data.consultationCount} atendimento(s)</span>
            )}
          </div>

          {summary.isPending ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> A IA está analisando o histórico...
            </div>
          ) : !summary.data?.summary ? (
            <p className="text-sm text-slate-400">{summary.data?.message || 'Sem dados para resumir.'}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed">{summary.data.summary.overview}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {summary.data.summary.activeProblems?.length > 0 && (
                  <div className="bg-amber-50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Activity className="w-3.5 h-3.5 text-amber-600" />
                      <p className="text-xs font-semibold text-amber-700">Problemas ativos</p>
                    </div>
                    <ul className="text-xs text-slate-600 space-y-0.5 list-disc list-inside">
                      {summary.data.summary.activeProblems.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}
                {summary.data.summary.medications?.length > 0 && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Pill className="w-3.5 h-3.5 text-blue-600" />
                      <p className="text-xs font-semibold text-blue-700">Medicações</p>
                    </div>
                    <ul className="text-xs text-slate-600 space-y-0.5 list-disc list-inside">
                      {summary.data.summary.medications.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                )}
                {summary.data.summary.allergies?.length > 0 && (
                  <div className="bg-red-50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                      <p className="text-xs font-semibold text-red-700">Alergias</p>
                    </div>
                    <ul className="text-xs text-slate-600 space-y-0.5 list-disc list-inside">
                      {summary.data.summary.allergies.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {summary.data.summary.recommendations && (
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-600 mb-1">Pontos de atenção para hoje</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{summary.data.summary.recommendations}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Histórico de Consultas</h2>
          <span className="text-xs text-slate-400">{patient.consultations?.length || 0} consulta(s)</span>
        </div>
        {!patient.consultations?.length ? (
          <div className="p-8 text-center">
            <Stethoscope className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Nenhuma consulta registrada</p>
            <Link href="/" className="btn-primary mt-4">
              <CalendarClock className="w-4 h-4" /> Agendar pela agenda
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {patient.consultations.map((c) => {
              const badge = STATUS_BADGE[c.status] || STATUS_BADGE.em_espera
              const isScheduled = c.status === 'scheduled' || c.status === 'em_espera'
              return (
                <Link
                  key={c.id}
                  href={`/consultations/${c.id}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isScheduled && (
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <CalendarClock className="w-4 h-4 text-blue-500" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {c.chiefComplaint || (isScheduled ? 'Consulta agendada' : 'Consulta sem queixa registrada')}
                      </p>
                      <p className="text-xs text-slate-400">
                        {isScheduled && c.scheduledAt
                          ? `Agendada para ${new Date(c.scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                          : format(c.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
