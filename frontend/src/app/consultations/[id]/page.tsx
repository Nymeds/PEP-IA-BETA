'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { ConsultationView } from '@/components/consultation/ConsultationView'
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

  return <ConsultationView consultation={consultation} />
}
