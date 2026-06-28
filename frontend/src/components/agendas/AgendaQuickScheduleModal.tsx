'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Search, UserRound, X } from 'lucide-react'
import { api } from '@/services/api'
import { Consultation, Patient } from '@/types'
import { formatDateHeading, formatDateTimeLabel } from '../dashboard/calendar-utils'
import { cn } from '../shared/utils'

interface Props {
  agendaId: string
  open: boolean
  date: string | null
  onClose: () => void
  onBooked?: (consultation: Consultation) => void
}

export function AgendaQuickScheduleModal({
  agendaId,
  open,
  date,
  onClose,
  onBooked,
}: Props) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const deferredSearch = useDeferredValue(search.trim())

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelectedPatient(null)
    setSelectedSlot('')
  }, [date, open])

  const patientsQuery = useQuery({
    queryKey: ['patients', 'helper', deferredSearch],
    queryFn: () => api.patients.list(deferredSearch || undefined),
    enabled: open,
  })

  const slotsQuery = useQuery({
    queryKey: ['agenda-slots', agendaId, date],
    queryFn: () => api.schedule.agendaSlots(agendaId, date || ''),
    enabled: open && Boolean(date),
  })

  const booking = useMutation({
    mutationFn: () =>
      api.schedule.quickBook(agendaId, {
        patientId: selectedPatient?.id || undefined,
        patientName: selectedPatient ? undefined : search.trim(),
        scheduledAt: selectedSlot,
      }),
    onSuccess: async (consultation) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['schedule-dashboard'] }),
        qc.invalidateQueries({ queryKey: ['agenda-calendar', agendaId] }),
        qc.invalidateQueries({ queryKey: ['agenda-slots', agendaId, date] }),
        qc.invalidateQueries({ queryKey: ['patients'] }),
      ])
      onBooked?.(consultation)
      onClose()
    },
  })

  const canSubmit =
    Boolean(selectedSlot) &&
    Boolean(selectedPatient || search.trim().length >= 2) &&
    slotsQuery.data?.allowed

  const helperLabel = useMemo(() => {
    if (selectedPatient) return `${selectedPatient.name} selecionado`
    if (search.trim().length >= 2) return `Cadastro rapido: ${search.trim()}`
    return 'Escolha ou digite um paciente'
  }, [search, selectedPatient])

  if (!open || !date) return null

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-1">Agendamento rapido</p>
            <h3 className="text-lg font-semibold text-slate-900 capitalize">{formatDateHeading(date)}</h3>
            <p className="text-sm text-slate-500 mt-1">
              Selecione pelo nome e reserve um horario sem abrir o cadastro completo.
            </p>
          </div>
          <button onClick={onClose} className="btn-secondary p-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid lg:grid-cols-[1.05fr_1.2fr] gap-0 overflow-y-auto">
          <section className="p-6 border-b lg:border-b-0 lg:border-r border-slate-100">
            <label className="form-label">Paciente</label>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 mb-4">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setSelectedPatient(null)
                }}
                placeholder="Buscar paciente por nome"
                className="flex-1 text-sm bg-transparent outline-none text-slate-800 placeholder-slate-400"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 mb-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-1">Selecao atual</p>
              <p className="text-sm font-medium text-slate-800">{helperLabel}</p>
              {!selectedPatient && search.trim().length >= 2 && (
                <p className="text-xs text-slate-500 mt-1">
                  Se o paciente nao existir, o sistema cria um cadastro rapido com esse nome.
                </p>
              )}
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {patientsQuery.isLoading ? (
                <div className="text-sm text-slate-400 py-6 text-center">Buscando pacientes...</div>
              ) : patientsQuery.data?.length ? (
                patientsQuery.data.map((patient) => {
                  const active = selectedPatient?.id === patient.id
                  return (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => {
                        setSelectedPatient(patient)
                        setSearch(patient.name)
                      }}
                      className={cn(
                        'w-full text-left rounded-xl border px-4 py-3 transition-colors',
                        active
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{patient.name}</p>
                          <p className="text-xs text-slate-500">
                            {patient.phone ||
                              patient.email ||
                              (patient.quickCreated
                                ? 'Cadastro rapido'
                                : 'Sem contato informado')}
                          </p>
                        </div>
                        <UserRound
                          className={cn('w-4 h-4', active ? 'text-primary-600' : 'text-slate-300')}
                        />
                      </div>
                    </button>
                  )
                })
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
                  <p className="text-sm text-slate-500">Nenhum paciente encontrado com esse nome.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Voce ainda pode fazer o cadastro rapido ao confirmar.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="p-6">
            {!slotsQuery.data ? (
              <div className="text-sm text-slate-400 py-10 text-center">Carregando horarios...</div>
            ) : !slotsQuery.data.allowed ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6">
                <p className="text-sm font-semibold text-amber-800">Dia indisponivel para atendimento</p>
                <p className="text-sm text-amber-700 mt-2">{slotsQuery.data.reason}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 mb-5">
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Capacidade do dia</p>
                    <p className="text-sm font-medium text-slate-800 mt-1">
                      {slotsQuery.data.occupiedCount} / {slotsQuery.data.maxAppointmentsPerDay} horario(s) ocupados
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Turnos ativos</p>
                    <p className="text-sm font-medium text-slate-800 mt-1">
                      {slotsQuery.data.enabledShiftCount} turno(s) configurado(s)
                    </p>
                  </div>
                </div>

                <div className="space-y-5">
                  {Array.from(new Set(slotsQuery.data.slots.map((slot) => slot.shiftLabel))).map((shiftLabel) => (
                    <div key={shiftLabel}>
                      <p className="text-sm font-semibold text-slate-800 mb-3">{shiftLabel}</p>
                      <div className="flex flex-wrap gap-2">
                        {slotsQuery.data.slots
                          .filter((slot) => slot.shiftLabel === shiftLabel)
                          .map((slot) => (
                            <button
                              key={slot.localDateTime}
                              type="button"
                              disabled={!slot.available}
                              onClick={() => setSelectedSlot(slot.isoDateTime)}
                              className={cn(
                                'px-3 py-2 rounded-xl border text-sm transition-colors',
                                !slot.available
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                  : selectedSlot === slot.isoDateTime
                                    ? 'bg-primary-600 text-white border-primary-600'
                                    : 'bg-white border-slate-200 hover:border-primary-400 text-slate-700'
                              )}
                            >
                              {slot.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>

                {slotsQuery.data.appointments.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-slate-100">
                    <p className="text-sm font-semibold text-slate-800 mb-3">Ja agendados neste dia</p>
                    <div className="space-y-2">
                      {slotsQuery.data.appointments.map((appointment) => (
                        <Link
                          key={appointment.id}
                          href={`/consultations/${appointment.id}`}
                          className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 hover:border-primary-300 hover:bg-primary-50/40 transition-colors"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-800">{appointment.patientName}</p>
                            <p className="text-xs text-slate-500">
                              {appointment.scheduleTitle
                                ? `${appointment.scheduleTitle} · ${appointment.chiefComplaint || 'Consulta agendada'}`
                                : appointment.chiefComplaint || 'Consulta agendada'}
                            </p>
                          </div>
                          <span className="text-xs text-slate-500">
                            {formatDateTimeLabel(appointment.scheduledAt)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            {selectedSlot
              ? `Horario selecionado: ${formatDateTimeLabel(selectedSlot)}`
              : 'Escolha um horario para continuar.'}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button
              onClick={() => booking.mutate()}
              disabled={!canSubmit || booking.isPending}
              className="btn-primary"
            >
              <CalendarPlus className="w-4 h-4" />
              {booking.isPending ? 'Agendando...' : 'Confirmar agendamento'}
            </button>
          </div>
        </div>

        {booking.isError && (
          <div className="px-6 pb-5 text-sm text-red-500">{booking.error.message}</div>
        )}
      </div>
    </div>
  )
}
