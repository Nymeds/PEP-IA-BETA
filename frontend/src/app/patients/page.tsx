import { AppLayout } from '@/components/layout/AppLayout'
import { PatientsList } from '@/components/patients/PatientsList'

export default function PatientsPage() {
  return (
    <AppLayout>
      <PatientsList />
    </AppLayout>
  )
}
