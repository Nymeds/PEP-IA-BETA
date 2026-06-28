'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Plus, Save } from 'lucide-react'
import { api } from '@/services/api'
import { ScheduleAgenda, ScheduleStatus } from '@/types'

const weekdayOptions = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terca' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sabado' },
]

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

export function AgendasSettingsManager() {
  const qc = useQueryClient()
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | null>(null)
  const [form, setForm] = useState<AgendaFormState>(defaultFormState)
  const [isCreating, setIsCreating] = useState(false)
const [activeTab, setActiveTab] = useState<'dados' | 'dias' | 'turnos'>('dados')
  const agendasQuery = useQuery({
    queryKey: ['schedule-agendas'],
    queryFn: () => api.schedule.agendas(),
  })

  useEffect(() => {
    if (isCreating) return
    const agendas = agendasQuery.data?.agendas || []
    if (!agendas.length) {
      setSelectedAgendaId(null)
      setForm(defaultFormState)
      return
    }

    const selected = agendas.find((agenda) => agenda.id === selectedAgendaId) || agendas[0]
    setSelectedAgendaId(selected.id)
    setForm(toFormState(selected))
  }, [agendasQuery.data?.agendas, isCreating, selectedAgendaId])

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
      ])
      setSelectedAgendaId(response.agenda.id)
      setIsCreating(false)
      setForm(toFormState(response.agenda))
    },
  })

  const agendas = agendasQuery.data?.agendas || []
  const enabledShifts = useMemo(
    () => form.shifts.filter((shift) => shift.enabled && shift.slots > 0),
    [form.shifts]
  )
  const maxAppointmentsPerDay = useMemo(
    () => enabledShifts.reduce((total, shift) => total + shift.slots, 0),
    [enabledShifts]
  )

  const handleSelectAgenda = (agenda: ScheduleAgenda) => {
    setSelectedAgendaId(agenda.id)
    setIsCreating(false)
    setForm(toFormState(agenda))
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Gerenciamento de agendas</h1>
        <p className="text-sm text-slate-500 mt-1">
          Crie uma agenda por especialidade, defina turnos, dias de atendimento e se ela esta ativa ou nao.
        </p>
      </div>

      <div className="grid xl:grid-cols-[0.9fr_1.1fr] gap-6">
        <div className="card p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Agendas cadastradas</h2>
              <p className="text-xs text-slate-500 mt-1">{agendas.length} agenda(s)</p>
            </div>
            <button
              onClick={() => {
                setIsCreating(true)
                setSelectedAgendaId(null)
                setForm(defaultFormState)
              }}
              className="btn-primary"
            >
              <Plus className="w-4 h-4" />
              Nova agenda
            </button>
          </div>

          <div className="space-y-3">
            {agendas.map((agenda) => {
              const active = !isCreating && selectedAgendaId === agenda.id
              return (
                <button
                  key={agenda.id}
                  onClick={() => handleSelectAgenda(agenda)}
                  className={
                    active
                      ? 'w-full text-left rounded-2xl border border-primary-500 bg-primary-50 p-4'
                      : 'w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300'
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{agenda.specialty}</p>
                      <p className="text-sm font-semibold text-slate-900 mt-1">{agenda.title}</p>
                    </div>
                    <span
                      className={
                        agenda.status === 'ativa'
                          ? 'px-2.5 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700'
                          : 'px-2.5 py-1 rounded-full text-xs bg-slate-100 text-slate-500'
                      }
                    >
                      {agenda.status === 'ativa' ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mt-4">
                    <span>{agenda.enabledShiftCount} turno(s)</span>
                    <span>{agenda.maxAppointmentsPerDay} vaga(s)/dia</span>
                  </div>
                </button>
              )
            })}

            {!agendas.length && !isCreating && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm text-slate-500">Nenhuma agenda criada ainda.</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {isCreating ? 'Nova agenda' : selectedAgendaId ? 'Editar agenda' : 'Criar primeira agenda'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Cada agenda pode ter propria especialidade, turnos e disponibilidade.
                </p>
              </div>
<div className="flex gap-2 mb-6 border-b border-slate-200">
  {[
    { id: 'dados', label: 'Dados gerais' },
    { id: 'dias', label: 'Dias de atendimento' },
    { id: 'turnos', label: 'Turnos' },
  ].map((tab) => (
    <button
      key={tab.id}
      type="button"
      onClick={() => setActiveTab(tab.id as 'dados' | 'dias' | 'turnos')}
      className={
        activeTab === tab.id
          ? 'px-4 py-2 text-sm font-semibold border-b-2 border-primary-600 text-primary-700'
          : 'px-4 py-2 text-sm text-slate-500 hover:text-slate-700'
      }
    >
      {tab.label}
    </button>
  ))}
</div>
              <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setStatus('ativa')}
                  className={
                    form.status === 'ativa'
                      ? 'px-4 py-2 text-sm bg-primary-600 text-white'
                      : 'px-4 py-2 text-sm bg-white text-slate-600'
                  }
                >
                  Ativa
                </button>
                <button
                  onClick={() => setStatus('inativa')}
                  className={
                    form.status === 'inativa'
                      ? 'px-4 py-2 text-sm bg-slate-700 text-white'
                      : 'px-4 py-2 text-sm bg-white text-slate-600'
                  }
                >
                  Inativa
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
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
                  placeholder="Ex.: Cardiologia"
                />
              </div>
            </div>

            <div className="card p-5 mb-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Dias de atendimento</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {weekdayOptions.map((weekday) => {
                  const checked = form.activeWeekDays.includes(weekday.value)
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
                          setForm((current) => ({
                            ...current,
                            activeWeekDays: event.target.checked
                              ? [...current.activeWeekDays, weekday.value].sort((a, b) => a - b)
                              : current.activeWeekDays.filter((day) => day !== weekday.value),
                          }))
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                    </label>
                  )
                })}
              </div>

              <label className="flex items-center justify-between mt-5 rounded-xl border border-slate-200 px-4 py-3 bg-white">
                <div>
                  <p className="text-sm font-medium text-slate-800">Atende em feriados</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Quando ativo, a agenda tambem libera horarios em feriados nacionais.
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
                  className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
              </label>
            </div>

            <div className="card p-5 mb-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Turnos e capacidade</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Informe quantos turnos o medico atende e quantas vagas cabem em cada um.
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
                    className="form-input w-28"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {form.shifts.map((shift, index) => (
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
                        checked={shift.enabled}
                        onChange={(event) => updateShift(index, 'enabled', event.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
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
                          onChange={(event) => updateShift(index, 'slots', Number(event.target.value) || 0)}
                          className="form-input"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {saveMutation.isError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 mb-4">
                {saveMutation.error.message}
              </div>
            )}

            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="btn-primary w-full justify-center py-2.5"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Salvando agenda...' : 'Salvar agenda'}
            </button>
          </div>

        <div className="card p-6">
  <div className="flex items-center justify-between gap-3 mb-5">
    <div>
      <h2 className="text-lg font-semibold text-slate-900">
        {isCreating ? 'Nova agenda' : selectedAgendaId ? 'Editar agenda' : 'Criar primeira agenda'}
      </h2>
      <p className="text-sm text-slate-500 mt-1">
        Cada agenda pode ter propria especialidade, turnos e disponibilidade.
      </p>
    </div>

    <div className="flex rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setStatus('ativa')}
        className={
          form.status === 'ativa'
            ? 'px-4 py-2 text-sm bg-primary-600 text-white'
            : 'px-4 py-2 text-sm bg-white text-slate-600'
        }
      >
        Ativa
      </button>
      <button
        onClick={() => setStatus('inativa')}
        className={
          form.status === 'inativa'
            ? 'px-4 py-2 text-sm bg-slate-700 text-white'
            : 'px-4 py-2 text-sm bg-white text-slate-600'
        }
      >
        Inativa
      </button>
    </div>
  </div>

  <div className="flex gap-2 mb-6 border-b border-slate-200">
    {[
      { id: 'dados', label: 'Dados gerais' },
      { id: 'dias', label: 'Dias de atendimento' },
      { id: 'turnos', label: 'Turnos' },
    ].map((tab) => (
      <button
        key={tab.id}
        type="button"
        onClick={() => setActiveTab(tab.id as 'dados' | 'dias' | 'turnos')}
        className={
          activeTab === tab.id
            ? 'px-4 py-2 text-sm font-semibold border-b-2 border-primary-600 text-primary-700'
            : 'px-4 py-2 text-sm text-slate-500 hover:text-slate-700'
        }
      >
        {tab.label}
      </button>
    ))}
  </div>

  {activeTab === 'dados' && (
    <div className="grid md:grid-cols-2 gap-4 mb-6">
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
          placeholder="Ex.: Cardiologia"
        />
      </div>
    </div>
  )}

  {activeTab === 'dias' && (
    <div className="card p-5 mb-6">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">
        Dias de atendimento
      </h3>

      <div className="grid md:grid-cols-2 gap-3">
        {weekdayOptions.map((weekday) => {
          const checked = form.activeWeekDays.includes(weekday.value)

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
                  setForm((current) => ({
                    ...current,
                    activeWeekDays: event.target.checked
                      ? [...current.activeWeekDays, weekday.value].sort((a, b) => a - b)
                      : current.activeWeekDays.filter((day) => day !== weekday.value),
                  }))
                }}
                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
            </label>
          )
        })}
      </div>

      <label className="flex items-center justify-between mt-5 rounded-xl border border-slate-200 px-4 py-3 bg-white">
        <div>
          <p className="text-sm font-medium text-slate-800">Atende em feriados</p>
          <p className="text-xs text-slate-500 mt-1">
            Quando ativo, a agenda tambem libera horarios em feriados nacionais.
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
          className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
        />
      </label>
    </div>
  )}

  {activeTab === 'turnos' && (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Turnos e capacidade
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Informe quantos turnos o medico atende e quantas vagas cabem em cada um.
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
            className="form-input w-28"
          />
        </div>
      </div>

      <div className="space-y-4">
        {form.shifts.map((shift, index) => (
          <div
            key={shift.id}
            className="rounded-2xl border border-slate-200 p-4 bg-slate-50"
          >
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">{shift.label}</p>
                <p className="text-xs text-slate-500">
                  Ative o turno e informe faixa horaria e quantidade de vagas.
                </p>
              </div>

              <input
                type="checkbox"
                checked={shift.enabled}
                onChange={(event) => updateShift(index, 'enabled', event.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
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

  {saveMutation.isError && (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 mb-4">
      {saveMutation.error.message}
    </div>
  )}

  <button
    type="button"
    onClick={() => saveMutation.mutate()}
    disabled={saveMutation.isPending}
    className="btn-primary w-full justify-center py-2.5"
  >
    <Save className="w-4 h-4" />
    {saveMutation.isPending ? 'Salvando agenda...' : 'Salvar agenda'}
  </button>
</div>
        </div>
      </div>

      {agendasQuery.isLoading && (
        <div className="text-sm text-slate-400 mt-4">Carregando agendas...</div>
      )}
    </div>
  )
}
