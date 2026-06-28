'use client'

import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Save } from 'lucide-react'
import { api } from '@/services/api'

const weekdayOptions = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terca' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sabado' },
]

const schema = z.object({
  activeWeekDays: z.array(z.number()).min(1, 'Selecione ao menos um dia de atendimento'),
  workOnHolidays: z.boolean(),
  appointmentDurationMinutes: z.coerce.number().min(10).max(180),
  shifts: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      enabled: z.boolean(),
      start: z.string(),
      end: z.string(),
      slots: z.coerce.number().min(0).max(24),
    })
  ),
})

type FormData = z.infer<typeof schema>

const defaultValues: FormData = {
  activeWeekDays: [1, 2, 3, 4, 5],
  workOnHolidays: false,
  appointmentDurationMinutes: 30,
  shifts: [
    { id: 'manha', label: 'Manha', enabled: true, start: '08:00', end: '12:00', slots: 8 },
    { id: 'tarde', label: 'Tarde', enabled: true, start: '13:00', end: '17:00', slots: 8 },
    { id: 'noite', label: 'Noite', enabled: false, start: '18:00', end: '21:00', slots: 6 },
  ],
}

export function ScheduleSettingsForm() {
  const qc = useQueryClient()
  const settingsQuery = useQuery({
    queryKey: ['schedule-settings'],
    queryFn: () => api.schedule.settings(),
  })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  useEffect(() => {
    if (settingsQuery.data?.settings) {
      reset(settingsQuery.data.settings)
    }
  }, [reset, settingsQuery.data?.settings])

  const values = watch()
  const enabledShifts = useMemo(
    () => values.shifts.filter((shift) => shift.enabled && shift.slots > 0),
    [values.shifts]
  )
  const maxAppointmentsPerDay = useMemo(
    () => enabledShifts.reduce((total, shift) => total + shift.slots, 0),
    [enabledShifts]
  )

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => api.schedule.updateSettings(data),
    onSuccess: async (response) => {
      reset(response.settings)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['schedule-settings'] }),
        qc.invalidateQueries({ queryKey: ['schedule-calendar'] }),
      ])
    },
  })

  if (settingsQuery.isLoading) {
    return <div className="p-6 text-sm text-slate-400">Carregando configuracao da agenda...</div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Configuracao da agenda</h1>
        <p className="text-sm text-slate-500 mt-1">
          Defina dias de atendimento, feriados, duracao da consulta e numero de turnos.
        </p>
      </div>

      <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))} className="space-y-6">
        <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="space-y-6">
            <div className="card p-6">
              <h2 className="section-title">Dias de atendimento</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {weekdayOptions.map((weekday) => {
                  const checked = values.activeWeekDays.includes(weekday.value)
                  return (
                    <label
                      key={weekday.value}
                      className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 bg-slate-50"
                    >
                      <span className="text-sm text-slate-700">{weekday.label}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const current = values.activeWeekDays
                          setValue(
                            'activeWeekDays',
                            event.target.checked
                              ? [...current, weekday.value].sort((a, b) => a - b)
                              : current.filter((item) => item !== weekday.value),
                            { shouldValidate: true }
                          )
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                    </label>
                  )
                })}
              </div>
              {errors.activeWeekDays && (
                <p className="text-sm text-red-500 mt-3">{errors.activeWeekDays.message}</p>
              )}

              <label className="flex items-center justify-between mt-5 rounded-xl border border-slate-200 px-4 py-3 bg-white">
                <div>
                  <p className="text-sm font-medium text-slate-800">Atende em feriados</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Quando ativo, o calendario tambem libera horarios em feriados nacionais.
                  </p>
                </div>
                <input
                  type="checkbox"
                  {...register('workOnHolidays')}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
              </label>
            </div>

            <div className="card p-6">
              <h2 className="section-title">Turnos e capacidade</h2>
              <div className="space-y-4">
                {values.shifts.map((shift, index) => (
                  <div key={shift.id} className="rounded-2xl border border-slate-200 p-4 bg-slate-50">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{shift.label}</p>
                        <p className="text-xs text-slate-500">
                          Ative o turno e informe faixa horaria e quantidade de vagas.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        {...register(`shifts.${index}.enabled` as const)}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <label className="form-label">Inicio</label>
                        <input type="time" {...register(`shifts.${index}.start` as const)} className="form-input" />
                      </div>
                      <div>
                        <label className="form-label">Fim</label>
                        <input type="time" {...register(`shifts.${index}.end` as const)} className="form-input" />
                      </div>
                      <div>
                        <label className="form-label">Vagas no turno</label>
                        <input
                          type="number"
                          min={0}
                          max={24}
                          {...register(`shifts.${index}.slots` as const, { valueAsNumber: true })}
                          className="form-input"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-6">
              <h2 className="section-title">Parametros gerais</h2>
              <div>
                <label className="form-label">Duracao da consulta (minutos)</label>
                <input
                  type="number"
                  min={10}
                  max={180}
                  {...register('appointmentDurationMinutes', { valueAsNumber: true })}
                  className="form-input"
                />
                {errors.appointmentDurationMinutes && (
                  <p className="text-sm text-red-500 mt-2">{errors.appointmentDurationMinutes.message}</p>
                )}
              </div>
            </div>

            <div className="card p-6">
              <h2 className="section-title">Resumo operacional</h2>
              <div className="space-y-3">
                <div className="rounded-xl bg-primary-50 border border-primary-100 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-primary-600">Numero de turnos</p>
                  <p className="text-lg font-semibold text-primary-900 mt-1">{enabledShifts.length}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Capacidade diaria</p>
                  <p className="text-lg font-semibold text-slate-900 mt-1">
                    {maxAppointmentsPerDay} agendamento(s)
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Dias ativos</p>
                  <p className="text-lg font-semibold text-slate-900 mt-1">
                    {values.activeWeekDays.length} dia(s) por semana
                  </p>
                </div>
              </div>
            </div>

            {saveMutation.isError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {saveMutation.error.message}
              </div>
            )}

            <button type="submit" disabled={saveMutation.isPending} className="btn-primary w-full justify-center py-2.5">
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Salvando agenda...' : 'Salvar configuracao'}
            </button>

            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <CalendarClock className="w-4 h-4 text-primary-600" />
                <p className="text-sm font-semibold text-slate-800">Como isso impacta o calendario</p>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                O dashboard usa esta configuracao para liberar dias validos, montar os horarios clicaveis e limitar o numero de vagas por turno.
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
