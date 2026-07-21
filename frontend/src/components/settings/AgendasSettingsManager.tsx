'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock,
  CalendarRange,
  CircleCheck,
  Clock3,
  FileText,
  Plus,
  Save,
  Stethoscope,
  Wrench,
} from 'lucide-react'
import { api } from '@/services/api'
import { AgendaFormOption, listPublishedAgendaForms } from '@/services/agenda-form-options'
import { ScheduleAgenda, ScheduleShift, ScheduleStatus } from '@/types'
import { cn } from '../shared/utils'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { dynamicPsychologyFormsEnabled } from '@/lib/features'

const weekdayOptions = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda', short: 'Seg' },
  { value: 2, label: 'Terca', short: 'Ter' },
  { value: 3, label: 'Quarta', short: 'Qua' },
  { value: 4, label: 'Quinta', short: 'Qui' },
  { value: 5, label: 'Sexta', short: 'Sex' },
  { value: 6, label: 'Sabado', short: 'Sab' },
]

const specialtyCatalog = [
  { code: 'psicologia', label: 'Psicologia' },
  { code: 'clinica_geral', label: 'Clínica geral' },
  { code: 'pediatria', label: 'Pediatria' },
  { code: 'ginecologia_obstetricia', label: 'Ginecologia e Obstetrícia' },
  { code: 'psiquiatria', label: 'Psiquiatria' },
  { code: 'cardiologia', label: 'Cardiologia' },
] as const

const topicOptions = [
  {
    id: 'identificacao',
    label: 'Identificação',
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
    label: 'Revisão',
    description: 'Resumo final antes de salvar e abrir a agenda.',
  },
] as const

type AgendaTopicId = (typeof topicOptions)[number]['id']

type AgendaFormState = Omit<
  ScheduleAgenda,
  'id' | 'enabledShiftCount' | 'maxAppointmentsPerDay' | 'createdAt' | 'updatedAt'
> & {
  specialtyCode?: string
  formTemplateId?: string | null
}

type AgendaWithForm = ScheduleAgenda & {
  specialtyCode?: string | null
  formTemplateId?: string | null
  formTemplate?: {
    id: string
    name: string
    status?: string
    latestVersion?: { id: string; version: number } | null
  } | null
}

const defaultFormState: AgendaFormState = {
  title: '',
  specialty: 'Psicologia',
  specialtyCode: 'psicologia',
  formTemplateId: null,
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
  const agendaWithForm = agenda as AgendaWithForm
  return {
    title: agenda.title,
    specialty: agenda.specialty,
    specialtyCode: agendaWithForm.specialtyCode || inferSpecialtyCode(agenda.specialty),
    formTemplateId: agendaWithForm.formTemplateId || null,
    status: agenda.status,
    activeWeekDays: agenda.activeWeekDays,
    workOnHolidays: agenda.workOnHolidays,
    appointmentDurationMinutes: agenda.appointmentDurationMinutes,
    shifts: agenda.shifts,
  }
}

function inferSpecialtyCode(specialty: string) {
  const normalized = specialty
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

  return specialtyCatalog.find((item) => item.code === normalized || item.label.toLowerCase() === specialty.toLowerCase())
    ?.code
}

function formOptionLabel(option: AgendaFormOption) {
  const version = option.latestVersion ? `v${option.latestVersion.version}` : 'sem versão publicada'
  return `${option.name} · ${version}${option.isDefault ? ' · padrão' : ''}`
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

function agendaSpecialtyKey(agenda: ScheduleAgenda) {
  const agendaWithForm = agenda as AgendaWithForm
  return agendaWithForm.specialtyCode || inferSpecialtyCode(agenda.specialty) || `legacy:${agenda.specialty}`
}

function cloneDefaultFormState(specialtyCode = 'psicologia'): AgendaFormState {
  const specialty = specialtyCatalog.find((item) => item.code === specialtyCode) || specialtyCatalog[0]
  return {
    ...defaultFormState,
    specialty: specialty.label,
    specialtyCode: specialty.code,
    activeWeekDays: [...defaultFormState.activeWeekDays],
    shifts: defaultFormState.shifts.map((shift) => ({ ...shift })),
  }
}

export function AgendasSettingsManager() {
  const qc = useQueryClient()
  const { confirm, notify } = useFeedback()
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | null>(null)
  const [form, setForm] = useState<AgendaFormState>(defaultFormState)
  const [isCreating, setIsCreating] = useState(false)
  const [activeTopic, setActiveTopic] = useState<AgendaTopicId>('identificacao')
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('todas')

  const agendasQuery = useQuery({
    queryKey: ['schedule-agendas'],
    queryFn: () => api.schedule.agendas(),
  })
  const publishedFormsQuery = useQuery({
    queryKey: ['agenda-published-form-options', 'psicologia'],
    queryFn: () => listPublishedAgendaForms('psicologia'),
    enabled: dynamicPsychologyFormsEnabled,
    retry: false,
  })

  const agendas = useMemo(() => agendasQuery.data?.agendas || [], [agendasQuery.data?.agendas])
  const publishedForms = useMemo(
    () => publishedFormsQuery.data || [],
    [publishedFormsQuery.data]
  )
  const specialtyOptions = useMemo(
    () => {
      const options = new Map<string, string>(
        specialtyCatalog.map((specialty) => [specialty.code, specialty.label])
      )
      agendas.forEach((agenda) => options.set(agendaSpecialtyKey(agenda), agenda.specialty))
      return Array.from(options, ([value, label]) => ({ value, label }))
    },
    [agendas]
  )

  const filteredAgendas = useMemo(() => {
    if (specialtyFilter === 'todas') return agendas
    return agendas.filter((agenda) => agendaSpecialtyKey(agenda) === specialtyFilter)
  }, [agendas, specialtyFilter])

  const selectedAgendaForBaseline = agendas.find((agenda) => agenda.id === selectedAgendaId)
  const selectedAgendaWithForm = selectedAgendaForBaseline as AgendaWithForm | undefined
  const baselineForm = selectedAgendaForBaseline ? toFormState(selectedAgendaForBaseline) : defaultFormState
  const isDirty = JSON.stringify(form) !== JSON.stringify(baselineForm)
  const defaultPublishedForm = publishedForms.find((item) => item.isDefault)
  const selectedPublishedForm = publishedForms.find((item) => item.id === form.formTemplateId)
  const effectivePublishedForm = selectedPublishedForm || (!form.formTemplateId ? defaultPublishedForm : undefined)
  const selectedFormName =
    effectivePublishedForm?.name ||
    (selectedAgendaWithForm?.formTemplateId === form.formTemplateId
      ? selectedAgendaWithForm?.formTemplate?.name ||
        (form.formTemplateId ? 'Prontuário anteriormente vinculado' : '')
      : '') ||
    (form.specialtyCode === 'psicologia' ? 'Nenhum prontuário publicado' : 'Prontuário legado')
  const effectiveFormEditorId =
    effectivePublishedForm?.id ||
    (selectedAgendaWithForm?.formTemplateId === form.formTemplateId
      ? selectedAgendaWithForm?.formTemplate?.id
      : undefined)
  const effectiveFormVersion =
    effectivePublishedForm?.latestVersion?.version ||
    (selectedAgendaWithForm?.formTemplateId === form.formTemplateId
      ? selectedAgendaWithForm?.formTemplate?.latestVersion?.version
      : undefined)

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (isCreating) return

    const source = filteredAgendas
    if (!source.length) {
      setSelectedAgendaId(null)
      const selectedSpecialtyCode = specialtyFilter !== 'todas' && !specialtyFilter.startsWith('legacy:')
        ? specialtyFilter
        : 'psicologia'
      setForm(cloneDefaultFormState(selectedSpecialtyCode))
      return
    }

    const selected = source.find((agenda) => agenda.id === selectedAgendaId) || source[0]
    setSelectedAgendaId(selected.id)
    setForm(toFormState(selected))
  }, [agendas, filteredAgendas, isCreating, selectedAgendaId, specialtyFilter])

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
      setSpecialtyFilter(agendaSpecialtyKey(response.agenda))
      setIsCreating(false)
      setForm(toFormState(response.agenda))
      setActiveTopic('revisao')
      notify('success', isCreating ? 'Agenda criada' : 'Agenda atualizada')
    },
    onError: (error) => notify('error', 'Não foi possível salvar a agenda', error.message),
  })

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
  const shiftConflicts = useMemo(() => {
    const active = form.shifts.filter((shift) => shift.enabled && shift.slots > 0)
    const conflicts: string[] = []
    for (let index = 0; index < active.length; index += 1) {
      const current = active[index]
      if (!current.start || !current.end || current.start >= current.end) {
        conflicts.push(`${current.label}: o início deve ser anterior ao fim`)
        continue
      }
      for (let otherIndex = index + 1; otherIndex < active.length; otherIndex += 1) {
        const other = active[otherIndex]
        if (current.start < other.end && other.start < current.end) {
          conflicts.push(`${current.label} conflita com ${other.label}`)
        }
      }
    }
    return conflicts
  }, [form.shifts])

  const handleSelectAgenda = async (agenda: ScheduleAgenda) => {
    if (isDirty) {
      const accepted = await confirm({ title: 'Descartar alterações?', description: 'Há mudanças nesta agenda que ainda não foram salvas.', confirmLabel: 'Descartar e continuar', danger: true })
      if (!accepted) return
    }
    setSelectedAgendaId(agenda.id)
    setIsCreating(false)
    setForm(toFormState(agenda))
    setActiveTopic('identificacao')
  }

  const handleStartCreate = async () => {
    if (isDirty) {
      const accepted = await confirm({ title: 'Descartar alterações?', description: 'Há mudanças nesta agenda que ainda não foram salvas.', confirmLabel: 'Descartar e criar nova', danger: true })
      if (!accepted) return
    }
    setIsCreating(true)
    setSelectedAgendaId(null)
    const selectedSpecialtyCode = specialtyFilter !== 'todas' && !specialtyFilter.startsWith('legacy:')
      ? specialtyFilter
      : 'psicologia'
    setForm(cloneDefaultFormState(selectedSpecialtyCode))
    setActiveTopic('identificacao')
  }

  const handleSpecialtyFilterChange = async (nextFilter: string) => {
    if (nextFilter === specialtyFilter) return
    if (isDirty) {
      const accepted = await confirm({
        title: 'Descartar alterações?',
        description: 'Há mudanças nesta agenda que ainda não foram salvas.',
        confirmLabel: 'Descartar e filtrar',
        danger: true,
      })
      if (!accepted) return
    }
    setIsCreating(false)
    setSelectedAgendaId(null)
    setSpecialtyFilter(nextFilter)
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

  const setSpecialty = (specialtyCode: string) => {
    const specialty = specialtyCatalog.find((item) => item.code === specialtyCode)
    if (!specialty) return
    setForm((current) => ({
      ...current,
      specialty: specialty.label,
      specialtyCode: specialty.code,
      formTemplateId: null,
    }))
  }

  const currentTopic = topicOptions.find((topic) => topic.id === activeTopic) || topicOptions[0]

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary-600">
            Configuração da agenda
          </p>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">Gerenciamento de agendas</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {agendas.length} agenda(s) cadastrada(s) · {activeAgendasCount} ativa(s)
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleStartCreate()}
          className="btn-primary"
        >
          <Plus className="h-4 w-4" />
          Nova agenda
        </button>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white xl:sticky xl:top-24">
          <div className="border-b border-slate-200 p-4">
            <label className="form-label" htmlFor="agenda-specialty-filter">Filtrar por especialidade</label>
            <select
              id="agenda-specialty-filter"
              value={specialtyFilter}
              onChange={(event) => void handleSpecialtyFilterChange(event.target.value)}
              className="form-input"
            >
              <option value="todas">Todas as especialidades</option>
              {specialtyOptions.map((specialty) => (
                <option key={specialty.value} value={specialty.value}>
                  {specialty.label}
                </option>
              ))}
            </select>
          </div>

          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">Agendas cadastradas</p>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {filteredAgendas.length}
              </span>
            </div>
          </div>

          {filteredAgendas.length ? (
              <div className="max-h-[calc(100dvh-290px)] divide-y divide-slate-100 overflow-y-auto">
                {filteredAgendas.map((agenda) => {
                  const isSelected = !isCreating && selectedAgendaId === agenda.id
                  const agendaWithForm = agenda as AgendaWithForm
                  const agendaFormOption = publishedForms.find((option) => option.id === agendaWithForm.formTemplateId)
                  const agendaFormName =
                    agendaFormOption?.name ||
                    agendaWithForm.formTemplate?.name ||
                    (agendaSpecialtyKey(agenda) === 'psicologia' ? defaultPublishedForm?.name || 'Sem prontuário padrão' : '')

                  return (
                    <button
                      key={agenda.id}
                      type="button"
                      onClick={() => void handleSelectAgenda(agenda)}
                      aria-pressed={isSelected}
                      className={cn(
                        'w-full border-l-4 px-4 py-3.5 text-left transition-colors',
                        isSelected
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-transparent bg-white hover:bg-slate-50'
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

                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span>{agenda.enabledShiftCount} turno(s)</span>
                        <span>{agenda.maxAppointmentsPerDay} vaga(s)/dia</span>
                      </div>
                      {agendaFormName ? (
                        <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-primary-700">
                          <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {agendaFormName}
                          {agendaWithForm.formTemplate?.latestVersion?.version
                            ? ` · v${agendaWithForm.formTemplate.latestVersion.version}`
                            : ''}
                        </p>
                      ) : null}
                    </button>
                  )
                })}
              </div>
          ) : (
              <div className="px-5 py-10 text-center">
                <CalendarRange className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-slate-700">Nenhuma agenda nesta especialidade</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Crie uma agenda já vinculada ao filtro selecionado.
                </p>
                <button type="button" onClick={() => void handleStartCreate()} className="btn-secondary mt-4">
                  <Plus className="h-4 w-4" />
                  Criar agenda
                </button>
              </div>
          )}
        </aside>

        {!isCreating && !selectedAgendaId ? (
          <section className="flex min-h-[440px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <div className="max-w-sm">
              <CalendarClock className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold text-slate-900">Selecione ou crie uma agenda</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                A configuração de especialidade, prontuário, dias e horários aparecerá aqui.
              </p>
            </div>
          </section>
        ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Stethoscope className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    {isCreating ? 'Nova agenda' : 'Agenda selecionada'}
                  </p>
                  <h2 className="mt-1 truncate text-xl font-semibold text-slate-950 sm:text-2xl">
                    {form.title.trim() || 'Defina o nome da agenda'}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{form.specialty.trim() || 'Especialidade ainda não informada'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{enabledShiftCount} turno(s)</span>
                    <span aria-hidden="true">·</span>
                    <span>{maxAppointmentsPerDay} vaga(s)/dia</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <div className="flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="Status da agenda">
                  <button
                    type="button"
                    onClick={() => setStatus('ativa')}
                    aria-pressed={form.status === 'ativa'}
                    className={cn(
                      'min-h-10 px-3 text-sm font-medium transition-colors',
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
                    aria-pressed={form.status === 'inativa'}
                    className={cn(
                      'min-h-10 px-3 text-sm font-medium transition-colors',
                      form.status === 'inativa'
                        ? 'bg-slate-800 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    Inativa
                  </button>
                </div>

                {selectedAgendaId && !isCreating ? (
                  <Link href={`/agendas/${selectedAgendaId}`} className="btn-secondary justify-center">
                    <CalendarClock className="h-4 w-4" />
                    Abrir agenda
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || shiftConflicts.length > 0 || !isDirty}
                  className="btn-primary justify-center"
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? 'Salvando...' : isDirty ? 'Salvar agenda' : 'Tudo salvo'}
                </button>
              </div>
            </div>
          </section>

          <section className={cn(
            'rounded-2xl border p-5 sm:p-6',
            dynamicPsychologyFormsEnabled && form.specialtyCode === 'psicologia'
              ? 'border-primary-200 bg-primary-50/60'
              : 'border-slate-200 bg-white'
          )}>
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary-600 shadow-sm ring-1 ring-slate-200">
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-950">Prontuário das novas consultas</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Escolha qual prontuário esta agenda deve usar. A versão publicada fica fixada no agendamento.
                  </p>
                </div>
              </div>

              {dynamicPsychologyFormsEnabled && form.specialtyCode === 'psicologia' ? (
                <div className="grid min-w-0 flex-1 gap-2 lg:max-w-[620px] lg:grid-cols-[minmax(260px,1fr)_auto]">
                  <div>
                    <label className="sr-only" htmlFor="agenda-form-template">Prontuário publicado</label>
                    <select
                      id="agenda-form-template"
                      value={form.formTemplateId || ''}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        formTemplateId: event.target.value || null,
                      }))}
                      className="form-input bg-white"
                      disabled={publishedFormsQuery.isLoading}
                    >
                      <option value="">
                        {publishedFormsQuery.isLoading
                          ? 'Carregando prontuários publicados...'
                          : defaultPublishedForm
                            ? `Padrão pessoal — ${formOptionLabel(defaultPublishedForm)}`
                            : 'Selecione um prontuário publicado'}
                      </option>
                      {form.formTemplateId && !selectedPublishedForm && selectedAgendaWithForm ? (
                        <option value={form.formTemplateId}>
                          {selectedAgendaWithForm.formTemplate?.name || 'Prontuário vinculado'} · indisponível
                        </option>
                      ) : null}
                      {publishedForms.map((option) => (
                        <option key={option.id} value={option.id}>{formOptionLabel(option)}</option>
                      ))}
                    </select>
                    <p className="mt-1.5 truncate text-xs text-primary-800">
                      Em uso: {selectedFormName}{effectiveFormVersion ? ` · v${effectiveFormVersion}` : ''}
                    </p>
                  </div>
                  <Link
                    href={effectiveFormEditorId ? `/formularios/${effectiveFormEditorId}` : '/formularios'}
                    className="btn-secondary justify-center bg-white"
                  >
                    <Wrench className="h-4 w-4" />
                    {effectiveFormEditorId ? 'Editar prontuário' : 'Gerenciar prontuários'}
                  </Link>
                </div>
              ) : (
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">
                  Prontuário legado
                </div>
              )}
            </div>
            {publishedFormsQuery.isError && form.specialtyCode === 'psicologia' ? (
              <p className="mt-3 text-xs text-amber-700" role="status">
                Não foi possível atualizar a lista agora. O vínculo salvo foi preservado.
              </p>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <nav className="overflow-x-auto border-b border-slate-200 px-2 pt-2" aria-label="Seções da configuração">
              <div className="flex min-w-max gap-1" role="tablist">
                {topicOptions.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTopic === topic.id}
                    onClick={() => setActiveTopic(topic.id)}
                    className={cn(
                      'min-h-10 rounded-t-lg border-b-2 px-4 text-sm font-medium transition-colors',
                      activeTopic === topic.id
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    )}
                  >
                    {topic.label}
                  </button>
                ))}
              </div>
            </nav>
            <div className="p-5 sm:p-6">
              <div className="mb-5">
                <h3 className="text-lg font-semibold text-slate-950">{currentTopic.label}</h3>
                <p className="mt-1 text-sm text-slate-500">{currentTopic.description}</p>
              </div>

            {activeTopic === 'identificacao' && (
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="form-label" htmlFor="agenda-title">Nome da agenda</label>
                  <input
                    id="agenda-title"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    className="form-input"
                    placeholder="Ex.: Psicologia clínica"
                  />
                  <p className="mt-2 text-xs text-slate-500">Este nome identifica a agenda nos calendários e agendamentos.</p>
                </div>

                <div>
                  <label className="form-label" htmlFor="agenda-specialty">Especialidade</label>
                  <select
                    id="agenda-specialty"
                    value={form.specialtyCode || `legacy:${form.specialty}`}
                    onChange={(event) => setSpecialty(event.target.value)}
                    className="form-input"
                  >
                    {!form.specialtyCode && form.specialty ? (
                      <option value={`legacy:${form.specialty}`}>{form.specialty} · legado</option>
                    ) : null}
                    {specialtyCatalog.map((specialty) => (
                      <option key={specialty.code} value={specialty.code}>{specialty.label}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">A especialidade define o motor clínico das novas consultas.</p>
                </div>
              </div>
            )}

            {activeTopic === 'disponibilidade' && (
              <div className="space-y-5">
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Dias de atendimento</p>
                    <p className="text-xs text-slate-500">{formatWeekdaySummary(form.activeWeekDays)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                    {weekdayOptions.map((weekday) => {
                      const isActive = form.activeWeekDays.includes(weekday.value)

                      return (
                        <button
                          key={weekday.value}
                          type="button"
                          onClick={() => toggleWeekday(weekday.value)}
                          aria-pressed={isActive}
                          className={cn(
                            'min-h-16 rounded-xl border px-2 py-3 text-center transition-colors',
                            isActive
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          )}
                        >
                          <p className="text-sm font-semibold">{weekday.short}</p>
                          <p className="mt-1 text-[11px]">{isActive ? 'Atende' : 'Fechado'}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Atendimento em feriados</p>
                    <p className="mt-1 text-xs text-slate-500">Libera horários também em feriados nacionais.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.workOnHolidays}
                    onChange={(event) => setForm((current) => ({ ...current, workOnHolidays: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>
              </div>
            )}

            {activeTopic === 'turnos' && (
              <div className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Turnos e capacidade</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Ajuste os horários de cada turno e a quantidade de vagas de cada faixa do dia.
                    </p>
                  </div>

                  <div>
                    <label className="form-label">Duração da consulta (min)</label>
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

                <div className="grid gap-4 2xl:grid-cols-3">
                  {form.shifts.map((shift, index) => (
                    <div
                      key={shift.id}
                      className={cn(
                        'rounded-xl border px-4 py-4 transition-colors',
                        shift.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
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

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                          <label className="form-label">Início</label>
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

                        <div className="col-span-2">
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
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Duração</p>
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
                          Nenhum turno está ativo no momento.
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
                        <p className="text-sm font-semibold text-slate-900">Capacidade diária</p>
                        <p className="text-xs text-slate-500">
                          {maxAppointmentsPerDay} vaga(s) distribuída(s) entre os turnos ativos.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock3 className="mt-0.5 h-4 w-4 text-cyan-600" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Turnos ativos</p>
                        <p className="text-xs text-slate-500">
                          {enabledShiftCount} turno(s) pronto(s) para gerar horários.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Stethoscope className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Especialidade</p>
                        <p className="text-xs text-slate-500">
                          {form.specialty.trim() || 'Ainda não preenchida'}.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <FileText className="mt-0.5 h-4 w-4 text-violet-600" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">Prontuário clínico</p>
                        <p className="truncate text-xs text-slate-500">{selectedFormName}.</p>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}
            </div>
          </section>

          {saveMutation.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {saveMutation.error.message}
            </div>
          )}

          {shiftConflicts.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3" role="alert">
              <p className="text-sm font-semibold text-amber-900">Revise os horários antes de salvar</p>
              {shiftConflicts.map((conflict) => <p key={conflict} className="mt-1 text-xs text-amber-800">{conflict}</p>)}
            </div>
          ) : null}

        </div>
        )}
      </div>

      {agendasQuery.isLoading && <div className="text-sm text-slate-400">Carregando agendas...</div>}
      {agendasQuery.isError && (
        <div className="text-sm text-red-500">{agendasQuery.error.message}</div>
      )}
    </div>
  )
}
