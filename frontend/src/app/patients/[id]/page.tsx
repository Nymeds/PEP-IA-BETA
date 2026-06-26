import { AppLayout } from '@/components/layout/AppLayout'
import { PatientDetail } from '@/components/patients/PatientDetail'

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <AppLayout>
      <PatientDetail patientId={id} />
    </AppLayout>
  )
}
