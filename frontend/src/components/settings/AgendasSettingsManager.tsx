'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock,
  CalendarRange,
  ChevronRight,
  CircleCheck,
  Clock3,
  Plus,
  Save,
  Stethoscope,
} from 'lucide-react'
import { api } from '@/services/api'
import { ScheduleAgenda, ScheduleShift, ScheduleStatus } from '@/types'
import { cn } from '../shared/utils'

const weekdayOptions = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda', short: 'Seg' },
  { value: 2, label: 'Terca', short: 'Ter' },
  { value: 3, label: 'Quarta', short: 'Qua' },
  { value: 4, label: 'Quinta', short: 'Qui' },
  { value: 5, label: 'Sexta', short: 'Sex' },
  { value: 6, label: 'Sabado', short: 'Sab' },
]

const topicOptions = [
  {
    id: 'identificacao',
    label: 'Identificacao',
    description: 'Nome, especialidade e status operacional.',
  },
  {
    id: 'disponibilidade',
    label: 'Disponibilidade',
    description: 'Dias da semana e regra para feriados.',
  },
  {
    id: 'turnos',
    label: 'Turnos',
    description: 'Horarios de atendimento, duracao e vagas por turno.',
  },
  {
    id: 'revisao',
    label: 'Revisao',
    description: 'Resumo final antes de salvar e abrir a agenda.',
  },
] as const

type AgendaTopicId = (typeof topicOptions)[number]['id']

type AgendaFormState = Omit<
  ScheduleAgenda,
  'id' | 'enabledShiftCount' | 'maxAppointmentsPerDay' | 'createdAt' | 'updatedAt'
>

const defaultFormState: AgendaFormState = {
  title: '',
  specialty: '',
  status: 'ativa',
  activeWeekDays: [1, 2, 3, 4, 5],
  workOnHolidays: false,
  appointmentDurationMinutes: 30,
  shifts: [
    { id: 'manha', label: 'Manha', enabled: true, start: '08:00', end: '12:00', slots: 8 },
    { id: 'tarde', label: 'Tarde', enabled: true, start: '13:00', end: '17:00', slots: 8 },
    { id: 'noite', label: 'Noite', enabled: false, start: '18:00', end: '21:00', slots: 6 },
  ],
}

function toFormState(agenda: ScheduleAgenda): AgendaFormState {
  return {
    title: agenda.title,
    specialty: agenda.specialty,
    status: agenda.status,
    activeWeekDays: agenda.activeWeekDays,
    workOnHolidays: agenda.workOnHolidays,
    appointmentDurationMinutes: agenda.appointmentDurationMinutes,
    shifts: agenda.shifts,
  }
}

function countEnabledShifts(shifts: ScheduleShift[]) {
  return shifts.filter((shift) => shift.enabled && shift.slots > 0).length
}

function countMaxAppointments(shifts: ScheduleShift[]) {
  return shifts
    .filter((shift) => shift.enabled && shift.slots > 0)
    .reduce((total, shift) => total + shift.slots, 0)
}

function formatWeekdaySummary(days: number[]) {
  const labels = weekdayOptions
    .filter((weekday) => days.includes(weekday.value))
    .map((weekday) => weekday.short)

  return labels.length ? labels.join(', ') : 'Nenhum dia selecionado'
}

function formatShiftWindow(shift: ScheduleShift) {
  return `${shift.start} - ${shift.end}`
}

function statusLabel(status: ScheduleStatus) {
  return status === 'ativa' ? 'Ativa' : 'Inativa'
}

function MetricPanel({
  label,
  value,
  detail,
  accent,
}: {
  label: string
  value: string
  detail: string
  accent: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div className={cn('mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl', accent)}>
        <div className="h-2.5 w-2.5 rounded-full bg-current" />
      </div>
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  )
}

export function AgendasSettingsManager() {
  const qc = useQueryClient()
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | null>(null)
  const [form, setForm] = useState<AgendaFormState>(defaultFormState)
  const [isCreating, setIsCreating] = useState(false)
  const [activeTopic, setActiveTopic] = useState<AgendaTopicId>('identificacao')
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('todas')

  const agendasQuery = useQuery({
    queryKey: ['schedule-agendas'],
    queryFn: () => api.schedule.agendas(),
  })

  const agendas = agendasQuery.data?.agendas || []
  const specialtyOptions = useMemo(
    () => Array.from(new Set(agendas.map((agenda) => agenda.specialty))).sort(),
    [agendas]
  )

  const filteredAgendas = useMemo(() => {
    if (specialtyFilter === 'todas') return agendas
    return agendas.filter((agenda) => agenda.specialty === specialtyFilter)
  }, [agendas, specialtyFilter])

  useEffect(() => {
    if (isCreating) return

    const hasSelectedAgenda =
      Boolean(selectedAgendaId) && agendas.some((agenda) => agenda.id === selectedAgendaId)
    const preferredSource = hasSelectedAgenda ? agendas : filteredAgendas
    const source = preferredSource.length ? preferredSource : agendas
    if (!source.length) {
      setSelectedAgendaId(null)
      setForm(defaultFormState)
      return
    }

    const selected = source.find((agenda) => agenda.id === selectedAgendaId) || source[0]
    setSelectedAgendaId(selected.id)
    setForm(toFormState(selected))
  }, [agendas, filteredAgendas, isCreating, selectedAgendaId])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isCreating || !selectedAgendaId) {
        return api.schedule.createAgenda(form)
      }
      return api.schedule.updateAgenda(selectedAgendaId, form)
    },
    onSuccess: async (response) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['schedule-agendas'] }),
        qc.invalidateQueries({ queryKey: ['schedule-dashboard'] }),
        qc.invalidateQueries({ queryKey: ['agenda-calendar', response.agenda.id] }),
      ])

      setSelectedAgendaId(response.agenda.id)
      setSpecialtyFilter(response.agenda.specialty)
      setIsCreating(false)
      setForm(toFormState(response.agenda))
      setActiveTopic('revisao')
    },
  })

  const selectedAgenda =
    agendas.find((agenda) => agenda.id === selectedAgendaId) || (isCreating ? null : filteredAgendas[0] || agendas[0] || null)
  const enabledShiftCount = useMemo(() => countEnabledShifts(form.shifts), [form.shifts])
  const maxAppointmentsPerDay = useMemo(() => countMaxAppointments(form.shifts), [form.shifts])
  const activeAgendasCount = useMemo(
    () => agendas.filter((agenda) => agenda.status === 'ativa').length,
    [agendas]
  )
  const enabledShifts = useMemo(
    () => form.shifts.filter((shift) => shift.enabled && shift.slots > 0),
    [form.shifts]
  )

  const handleSelectAgenda = (agenda: ScheduleAgenda) => {
    setSelectedAgendaId(agenda.id)
    setIsCreating(false)
    setForm(toFormState(agenda))
    setActiveTopic('identificacao')
  }

  const toggleWeekday = (weekdayValue: number) => {
    setForm((current) => ({
      ...current,
      activeWeekDays: current.activeWeekDays.includes(weekdayValue)
        ? current.activeWeekDays.filter((day) => day !== weekdayValue)
        : [...current.activeWeekDays, weekdayValue].sort((a, b) => a - b),
    }))
  }

  const updateShift = (
    index: number,
    field: 'enabled' | 'start' | 'end' | 'slots',
    value: boolean | string | number
  ) => {
    setForm((current) => ({
      ...current,
      shifts: current.shifts.map((shift, shiftIndex) =>
        shiftIndex === index ? { ...shift, [field]: value } : shift
      ),
    }))
  }

  const setStatus = (status: ScheduleStatus) => {
    setForm((current) => ({ ...current, status }))
  }

  const currentTopic = topicOptions.find((topic) => topic.id === activeTopic) || topicOptions[0]

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-primary-600">Configuracao da agenda</p>
          <h1 className="text-3xl font-bold text-slate-900">Gerenciamento de agendas</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Organizamos a edicao em topicos para ficar mais rapido revisar especialidade, dias,
            turnos e a capacidade total antes de liberar a agenda para uso.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsCreating(true)
            setSelectedAgendaId(null)
            setForm(defaultFormState)
            setActiveTopic('identificacao')
          }}
          className="btn-primary"
        >
          <Plus className="h-4 w-4" />
          Nova agenda
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricPanel
          label="Agendas"
          value={String(agendas.length)}
          detail="especialidades ou frentes cadastradas"
          accent="bg-primary-50 text-primary-600"
        />
        <MetricPanel
          label="Ativas"
          value={String(activeAgendasCount)}
          detail="agendas liberadas para novos agendamentos"
          accent="bg-emerald-50 text-emerald-600"
        />
        <MetricPanel
          label="Turnos"
          value={String(enabledShiftCount)}
          detail="turnos ativos na agenda em edicao"
          accent="bg-cyan-50 text-cyan-600"
        />
        <MetricPanel
          label="Vagas/dia"
          value={String(maxAppointmentsPerDay)}
          detail="capacidade diaria calculada a partir dos turnos"
          accent="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <label className="form-label">Especialidade</label>
            <select
              value={specialtyFilter}
              onChange={(event) => setSpecialtyFilter(event.target.value)}
              className="form-input"
            >
              <option value="todas">Todas as especialidades</option>
              {specialtyOptions.map((specialty) => (
                <option key={specialty} value={specialty}>
                  {specialty}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              Filtre a lista ao lado para revisar cada agenda por especialidade.
            </p>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">Agendas cadastradas</p>
              <p className="mt-1 text-xs text-slate-500">
                {filteredAgendas.length} agenda(s) exibida(s)
              </p>
            </div>

            {filteredAgendas.length ? (
              <div className="divide-y divide-slate-100">
                {filteredAgendas.map((agenda) => {
                  const isSelected = !isCreating && selectedAgendaId === agenda.id

                  return (
                    <button
                      key={agenda.id}
                      type="button"
                      onClick={() => handleSelectAgenda(agenda)}
                      className={cn(
                        'w-full px-4 py-4 text-left transition-colors',
                        isSelected ? 'bg-primary-50' : 'bg-white hover:bg-slate-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                            {agenda.specialty}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{agenda.title}</p>
                        </div>
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-1 text-xs',
                            agenda.status === 'ativa'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          )}
                        >
                          {statusLabel(agenda.status)}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                        <span>{agenda.enabledShiftCount} turno(s)</span>
                        <span>{agenda.maxAppointmentsPerDay} vaga(s)/dia</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-slate-500">Nenhuma agenda encontrada neste filtro.</p>
              </div>
            )}
          </section>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                  <Stethoscope className="h-6 w-6" />
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    {isCreating ? 'Nova agenda' : 'Agenda selecionada'}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                    {form.title.trim() || 'Defina o nome da agenda'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {form.specialty.trim() || 'Especialidade ainda nao informada'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:items-end">
                <div className="flex overflow-hidden rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setStatus('ativa')}
                    className={cn(
                      'px-4 py-2 text-sm transition-colors',
                      form.status === 'ativa'
                        ? 'bg-primary-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    Ativa
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('inativa')}
                    className={cn(
                      'px-4 py-2 text-sm transition-colors',
                      form.status === 'inativa'
                        ? 'bg-slate-800 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    Inativa
                  </button>
                </div>

                {selectedAgendaId && !isCreating ? (
                  <Link href={`/agendas/${selectedAgendaId}`} className="btn-secondary">
                    <CalendarClock className="h-4 w-4" />
                    Abrir agenda
                  </Link>
                ) : (
                  <p className="text-xs text-slate-400">Salve para liberar a visualizacao operacional.</p>
                )}
              </div>
            </div>
          </section>

          <nav className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2 md:grid-cols-4">
            {topicOptions.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => setActiveTopic(topic.id)}
                className={cn(
                  'rounded-lg px-4 py-3 text-left transition-colors',
                  activeTopic === topic.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                <p className="text-sm font-semibold">{topic.label}</p>
                <p
                  className={cn(
                    'mt-1 text-xs',
                    activeTopic === topic.id ? 'text-primary-100' : 'text-slate-400'
                  )}
                >
                  {topic.description}
                </p>
              </button>
            ))}
          </nav>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-6 flex flex-col gap-2 border-b border-slate-100 pb-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Topico atual</p>
              <h3 className="text-lg font-semibold text-slate-900">{currentTopic.label}</h3>
              <p className="text-sm text-slate-500">{currentTopic.description}</p>
            </div>

            {activeTopic === 'identificacao' && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="form-label">Nome da agenda</label>
                    <input
                      value={form.title}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, title: event.target.value }))
                      }
                      className="form-input"
                      placeholder="Ex.: Agenda ambulatorial"
                    />
                  </div>

                  <div>
                    <label className="form-label">Especialidade</label>
                    <input
                      value={form.specialty}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, specialty: event.target.value }))
                      }
                      className="form-input"
                      placeholder="Ex.: Pneumologia"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Resumo rapido</p>
                  <div className="mt-4 space-y-3 text-sm text-slate-600">
                    <div className="flex items-center justify-between gap-3">
                      <span>Status</span>
                      <span className="font-medium text-slate-900">{statusLabel(form.status)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Especialidade</span>
                      <span className="font-medium text-slate-900">
                        {form.specialty.trim() || 'Nao informada'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Vagas por dia</span>
                      <span className="font-medium text-slate-900">{maxAppointmentsPerDay}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTopic === 'disponibilidade' && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div>
                  <p className="mb-4 text-sm font-semibold text-slate-900">Dias de atendimento</p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {weekdayOptions.map((weekday) => {
                      const isActive = form.activeWeekDays.includes(weekday.value)

                      return (
                        <button
                          key={weekday.value}
                          type="button"
                          onClick={() => toggleWeekday(weekday.value)}
                          className={cn(
                            'rounded-xl border px-4 py-4 text-left transition-colors',
                            isActive
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                          )}
                        >
                          <p className="text-sm font-semibold">{weekday.label}</p>
                          <p className="mt-1 text-xs">
                            {isActive ? 'Dia habilitado na agenda' : 'Dia sem atendimento'}
                          </p>
                        </button>
                      )
                    })}
                  </div>

                  <label className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Atende em feriados</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Quando ligado, a agenda abre horarios tambem em feriados nacionais.
                      </p>
                    </div>

                    <input
                      type="checkbox"
                      checked={form.workOnHolidays}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          workOnHolidays: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                  </label>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Leitura operacional</p>
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {form.activeWeekDays.length} dia(s) ativo(s)
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{formatWeekdaySummary(form.activeWeekDays)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {form.workOnHolidays ? 'Feriados liberados' : 'Feriados bloqueados'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Isso impacta a geracao de vagas nos dias comemorativos.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTopic === 'turnos' && (
              <div className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Turnos e capacidade</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Ajuste os horarios de cada turno e a quantidade de vagas que cabem em cada
                      faixa do dia.
                    </p>
                  </div>

                  <div>
                    <label className="form-label">Duracao da consulta (min)</label>
                    <input
                      type="number"
                      min={10}
                      max={180}
                      value={form.appointmentDurationMinutes}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          appointmentDurationMinutes: Number(event.target.value) || 30,
                        }))
                      }
                      className="form-input"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  {form.shifts.map((shift, index) => (
                    <div
                      key={shift.id}
                      className={cn(
                        'rounded-xl border px-4 py-4 transition-colors',
                        shift.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'
                      )}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{shift.label}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {shift.enabled
                              ? `Faixa atual: ${formatShiftWindow(shift)}`
                              : 'Turno desativado na agenda'}
                          </p>
                        </div>

                        <label className="flex items-center gap-3 text-sm text-slate-600">
                          <span>Turno ativo</span>
                          <input
                            type="checkbox"
                            checked={shift.enabled}
                            onChange={(event) => updateShift(index, 'enabled', event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                          />
                        </label>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <div>
                          <label className="form-label">Inicio</label>
                          <input
                            type="time"
                            value={shift.start}
                            onChange={(event) => updateShift(index, 'start', event.target.value)}
                            className="form-input"
                          />
                        </div>

                        <div>
                          <label className="form-label">Fim</label>
                          <input
                            type="time"
                            value={shift.end}
                            onChange={(event) => updateShift(index, 'end', event.target.value)}
                            className="form-input"
                          />
                        </div>

                        <div>
                          <label className="form-label">Vagas no turno</label>
                          <input
                            type="number"
                            min={0}
                            max={24}
                            value={shift.slots}
                            onChange={(event) =>
                              updateShift(index, 'slots', Number(event.target.value) || 0)
                            }
                            className="form-input"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTopic === 'revisao' && (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-center gap-2 text-slate-900">
                      <CircleCheck className="h-4 w-4 text-emerald-600" />
                      <p className="text-sm font-semibold">Resumo operacional</p>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Dias</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatWeekdaySummary(form.activeWeekDays)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Duracao</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {form.appointmentDurationMinutes} min
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 px-4 py-4">
                      <p className="text-sm font-semibold text-slate-900">Turnos habilitados</p>
                    </div>

                    {enabledShifts.length ? (
                      <div className="divide-y divide-slate-100">
                        {enabledShifts.map((shift) => (
                          <div
                            key={shift.id}
                            className="flex flex-col gap-2 px-4 py-4 md:flex-row md:items-center md:justify-between"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{shift.label}</p>
                              <p className="text-xs text-slate-500">{formatShiftWindow(shift)}</p>
                            </div>
                            <p className="text-sm text-slate-600">{shift.slots} vaga(s)</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-6 text-sm text-slate-500">
                        Nenhum turno esta ativo no momento.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Checklist</p>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <CalendarRange className="mt-0.5 h-4 w-4 text-primary-600" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Capacidade diaria</p>
                        <p className="text-xs text-slate-500">
                          {maxAppointmentsPerDay} vaga(s) distribuidas entre os turnos ativos.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock3 className="mt-0.5 h-4 w-4 text-cyan-600" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Turnos ativos</p>
                        <p className="text-xs text-slate-500">
                          {enabledShiftCount} turno(s) prontos para gerar horarios.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Stethoscope className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Especialidade</p>
                        <p className="text-xs text-slate-500">
                          {form.specialty.trim() || 'Ainda nao preenchida'}.
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedAgendaId && !isCreating && (
                    <Link href={`/agendas/${selectedAgendaId}`} className="btn-secondary mt-5 w-full justify-center">
                      <CalendarClock className="h-4 w-4" />
                      Ver agenda operacional
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>

          {saveMutation.isError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {saveMutation.error.message}
            </div>
          )}

          <section className="rounded-xl border border-slate-200 bg-white px-6 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {form.title.trim() || 'Agenda sem nome definido'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {enabledShiftCount} turno(s) ativo(s), {maxAppointmentsPerDay} vaga(s) por dia
                  e {form.activeWeekDays.length} dia(s) habilitado(s).
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {selectedAgendaId && !isCreating && (
                  <Link href={`/agendas/${selectedAgendaId}`} className="btn-secondary justify-center">
                    <ChevronRight className="h-4 w-4" />
                    Abrir agenda
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="btn-primary justify-center"
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? 'Salvando agenda...' : 'Salvar agenda'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {agendasQuery.isLoading && <div className="text-sm text-slate-400">Carregando agendas...</div>}
      {agendasQuery.isError && (
        <div className="text-sm text-red-500">{agendasQuery.error.message}</div>
      )}
    </div>
  )
}
