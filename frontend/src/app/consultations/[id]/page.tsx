'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { ConsultationView } from '@/components/consultation/ConsultationView'
import { DynamicConsultationView } from '@/components/consultation/dynamic/DynamicConsultationView'
import { dynamicPsychologyFormsEnabled } from '@/lib/features'
import { use } from 'react'

export default function ConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data: consultation, isLoading } = useQuery({
    queryKey: ['consultations', id],
    queryFn: () => api.consultations.get(id),
  })

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Carregando consulta...</p>
        </div>
      </div>
    )
  }

  if (!consultation) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-slate-400">Consulta não encontrada</p>
      </div>
    )
  }

  if (consultation.formMode === 'dynamic' && !dynamicPsychologyFormsEnabled) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Psicologia dinâmica desativada</h1>
          <p className="mt-2 text-sm text-slate-600">
            Esta consulta usa um formulário dinâmico preservado. Ative a feature flag para acessá-la com segurança.
          </p>
        </div>
      </div>
    )
  }

  return consultation.formMode === 'dynamic'
    ? <DynamicConsultationView consultation={consultation} />
    : <ConsultationView consultation={consultation} />
}
