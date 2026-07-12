'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarClock, Loader2, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { CalendarAppointment, AppointmentOperation } from '@/types'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { Button } from '@/components/ui/Button'

function toLocalInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const COPY: Record<AppointmentOperation, { title: string; confirm: string; danger?: boolean }> = {
  reschedule: { title: 'Remarcar consulta', confirm: 'Confirmar novo horário' },
  cancel: { title: 'Cancelar agendamento', confirm: 'Cancelar agendamento', danger: true },
  no_show: { title: 'Registrar falta', confirm: 'Registrar falta' },
}

export function AppointmentOperationDialog({
  appointment,
  operation,
  onClose,
}: {
  appointment: CalendarAppointment | null
  operation: AppointmentOperation | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { notify } = useFeedback()
  const [scheduledAt, setScheduledAt] = useState('')
  const [reason, setReason] = useState('')
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!appointment || !operation) return
    setScheduledAt(toLocalInput(appointment.scheduledAt))
    setReason('')
    window.setTimeout(() => reasonRef.current?.focus(), 0)
  }, [appointment, operation])

  const mutation = useMutation({
    mutationFn: () => {
      if (!appointment || !operation) throw new Error('Operação inválida')
      return api.schedule.updateAppointment(appointment.id, {
        operation,
        reason,
        scheduledAt: operation === 'reschedule' ? new Date(scheduledAt).toISOString() : undefined,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agenda-slots'] })
      void queryClient.invalidateQueries({ queryKey: ['agenda-calendar'] })
      void queryClient.invalidateQueries({ queryKey: ['schedule-dashboard'] })
      notify('success', operation === 'reschedule' ? 'Consulta remarcada' : operation === 'cancel' ? 'Agendamento cancelado' : 'Falta registrada')
      onClose()
    },
    onError: (error) => notify('error', 'Não foi possível alterar o agendamento', error.message),
  })

  if (!appointment || !operation) return null
  const copy = COPY[operation]
  const valid = reason.trim().length >= 3 && (operation !== 'reschedule' || Boolean(scheduledAt))

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-operation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary-600" aria-hidden="true" />
            <h2 id="appointment-operation-title" className="text-sm font-semibold text-slate-950">{copy.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">{appointment.patientName}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {appointment.scheduledAt ? new Date(appointment.scheduledAt).toLocaleString('pt-BR') : 'Sem horário'}
            </p>
          </div>

          {operation === 'reschedule' ? (
            <div>
              <label htmlFor="reschedule-at" className="form-label">Novo horário</label>
              <input id="reschedule-at" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="form-input" />
              <p className="mt-1 text-xs text-slate-500">O horário precisa pertencer a um turno livre da agenda.</p>
            </div>
          ) : null}

          <div>
            <label htmlFor="appointment-reason" className="form-label">Motivo da alteração</label>
            <textarea
              ref={reasonRef}
              id="appointment-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="form-textarea"
              placeholder="Registre um motivo curto para o histórico"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <Button onClick={onClose}>Voltar</Button>
          <Button variant={copy.danger ? 'danger' : 'primary'} disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {copy.confirm}
          </Button>
        </div>
      </div>
    </div>
  )
}
