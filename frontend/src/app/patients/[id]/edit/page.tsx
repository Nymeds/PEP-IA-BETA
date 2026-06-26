'use client'
import { AppLayout } from '@/components/layout/AppLayout'
import { PatientForm } from '@/components/patients/PatientForm'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { use } from 'react'

export default function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: patient, isLoading } = useQuery({
    queryKey: ['patients', id],
    queryFn: () => api.patients.get(id),
  })

  if (isLoading) return <AppLayout><div className="p-6 text-slate-400">Carregando...</div></AppLayout>
  if (!patient) return <AppLayout><div className="p-6 text-slate-400">Não encontrado</div></AppLayout>

  return (
    <AppLayout>
      <PatientForm patient={patient} />
    </AppLayout>
  )
}
