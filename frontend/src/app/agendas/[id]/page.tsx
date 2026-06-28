'use client'

import { use } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { AgendaCalendarView } from '@/components/agendas/AgendaCalendarView'

export default function AgendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  return (
    <AppLayout>
      <AgendaCalendarView agendaId={id} />
    </AppLayout>
  )
}
