'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  BrainCircuit,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Settings2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserX,
  Wrench,
  XCircle,
} from 'lucide-react'
import { api } from '@/services/api'
import { AgendaFormOption, listPublishedAgendaForms } from '@/services/agenda-form-options'
import {
  AppointmentOperation,
  CalendarAppointment,
  ScheduleAgenda,
  ScheduleAgendaSlotsResponse,
  ScheduleSlot,
} from '@/types'
import { formatDateHeading, dateToInput } from '../dashboard/calendar-utils'
import { cn } from '../shared/utils'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/AsyncState'
import { AgendaQuickScheduleModal } from './AgendaQuickScheduleModal'
import { AppointmentOperationDialog } from './AppointmentOperationDialog'
import { dynamicPsychologyFormsEnabled } from '@/lib/features'

type SlotFilter = 'all' | 'free' | 'reserved' | 'in_progress' | 'completed'

interface AgendaRuntimeMetadata {
  specialtyCode?: string | null
  formTemplateId?: string | null
  formTemplateName?: string | null
  formVersion?: number | null
  formTemplate?: {
    id: string
    name: string
    status?: string
    latestVersion?: { id: string; version: number } | null
  } | null
}

interface AppointmentRuntimeMetadata {
  formMode?: 'legacy' | 'dynamic' | null
  specialtyCode?: string | null
  formTemplateVersionId?: string | null
  scheduleFormTemplateId?: string | null
  formTemplateName?: string | null
  formVersion?: number | null
  formTemplate?: { id?: string; name?: string } | null
  formTemplateVersion?: {
    id?: string
    version?: number
    template?: { id?: string; name?: string } | null
  } | null
  consentStatus?: string | boolean | null
  consentReady?: boolean | null
  aiReadiness?: string | boolean | null
  aiReady?: boolean | null
}

const FILTERS: Array<{ id: SlotFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'free', label: 'Livres' },
  { id: 'reserved', label: 'Reservados' },
  { id: 'in_progress', label: 'Em consulta' },
  { id: 'completed', label: 'Finalizados' },
]

function parseInputDate(input: string) {
  return new Date(`${input}T00:00:00`)
}

function shiftDate(input: string, offset: number) {
  const date = parseInputDate(input)
  date.setDate(date.getDate() + offset)
  return dateToInput(date)
}

function getWeekDates(selectedDate: string) {
  const start = parseInputDate(selectedDate)
  const day = start.getDay()
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return dateToInput(date)
  })
}

function formatWeekRange(dates: string[]) {
  const format = (date: string) =>
    parseInputDate(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${format(dates[0])} a ${format(dates[dates.length - 1])}`
}

function formatMonth(date: string) {
  const formatted = parseInputDate(date).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1).replace('.', '')
}

function appointmentStatus(status?: string | null) {
  if (status === 'em_consulta' || status === 'active') return 'in_progress'
  if (status === 'finalizado' || status === 'completed') return 'completed'
  if (status === 'cancelado' || status === 'canceled') return 'canceled'
  if (status === 'faltou' || status === 'no_show') return 'no_show'
  return 'reserved'
}

function getSlotStatus(slot: ScheduleSlot) {
  if (slot.available || !slot.appointment) {
    return {
      label: 'Livre',
      badgeClass: 'bg-cyan-50 text-cyan-700',
      dotClass: 'border-cyan-500 bg-white',
      cardClass: 'border-slate-200 bg-white',
      description: 'Disponível para agendamento',
    }
  }

  const status = appointmentStatus(slot.appointment.status)
  if (status === 'in_progress') {
    return {
      label: 'Em consulta',
      badgeClass: 'bg-amber-50 text-amber-700',
      dotClass: 'border-amber-500 bg-amber-50',
      cardClass: 'border-amber-200 bg-amber-50/30',
      description: 'Atendimento em andamento',
    }
  }
  if (status === 'completed') {
    return {
      label: 'Finalizada',
      badgeClass: 'bg-emerald-50 text-emerald-700',
      dotClass: 'border-emerald-500 bg-emerald-50',
      cardClass: 'border-emerald-200 bg-emerald-50/20',
      description: 'Atendimento encerrado',
    }
  }
  if (status === 'no_show') {
    return {
      label: 'Faltou',
      badgeClass: 'bg-red-50 text-red-700',
      dotClass: 'border-red-400 bg-red-50',
      cardClass: 'border-red-100 bg-red-50/20',
      description: 'Ausência registrada',
    }
  }
  return {
    label: 'Reservada',
    badgeClass: 'bg-slate-100 text-slate-700',
    dotClass: 'border-primary-500 bg-primary-50',
    cardClass: 'border-slate-200 bg-white',
    description: 'Consulta agendada',
  }
}

function matchesFilter(slot: ScheduleSlot, filter: SlotFilter) {
  if (filter === 'all') return true
  if (filter === 'free') return slot.available
  if (!slot.appointment || slot.available) return false
  return appointmentStatus(slot.appointment.status) === filter
}

function getAgendaFormContext(agenda?: ScheduleAgenda, option?: AgendaFormOption) {
  const metadata = agenda as (ScheduleAgenda & AgendaRuntimeMetadata) | undefined
  const specialtyCode = metadata?.specialtyCode || ''
  const name = metadata?.formTemplate?.name || metadata?.formTemplateName || option?.name || ''
  const version =
    metadata?.formTemplate?.latestVersion?.version ||
    metadata?.formVersion ||
    option?.latestVersion?.version ||
    null
  const psychology = specialtyCode === 'psicologia' || agenda?.specialty.toLowerCase() === 'psicologia'
  const dynamic = dynamicPsychologyFormsEnabled && psychology

  return {
    name: name || (dynamic ? 'Padrão de Psicologia' : 'Prontuário legado'),
    detail: version ? `Versão ${version} publicada` : dynamic ? 'Definido ao agendar' : 'Motor clínico atual',
    dynamic,
  }
}

function getAppointmentContext(appointment: CalendarAppointment, pinnedOption?: AgendaFormOption) {
  const metadata = appointment as CalendarAppointment & AppointmentRuntimeMetadata
  const dynamic = metadata.formMode === 'dynamic' || Boolean(metadata.formTemplateVersionId)
  const formName =
    metadata.formTemplate?.name ||
    metadata.formTemplateVersion?.template?.name ||
    metadata.formTemplateName ||
    pinnedOption?.name ||
    (dynamic ? 'Formulário dinâmico' : '')
  const version =
    metadata.formTemplateVersion?.version ||
    metadata.formVersion ||
    pinnedOption?.latestVersion?.version ||
    null

  const consentValue = metadata.consentStatus ?? metadata.consentReady
  const consentPositive =
    consentValue === true ||
    ['registrado', 'confirmado', 'concedido', 'granted', 'ready'].includes(String(consentValue).toLowerCase())
  const consentLabel =
    consentValue === undefined || consentValue === null
      ? dynamic
        ? 'Consentimento a confirmar'
        : ''
      : consentPositive
        ? 'Consentimento registrado'
        : 'Consentimento pendente'

  const aiValue = metadata.aiReadiness ?? metadata.aiReady
  const aiPositive =
    aiValue === true || ['pronta', 'pronto', 'ready'].includes(String(aiValue).toLowerCase())
  const aiLabel =
    aiValue === undefined || aiValue === null
      ? dynamic
        ? 'IA preparada ao iniciar'
        : ''
      : aiPositive
        ? 'IA pronta'
        : 'IA requer preparação'

  return {
    dynamic,
    formName,
    version,
    consentLabel,
    consentPositive,
    aiLabel,
    aiPositive,
    templateId: metadata.formTemplateVersion?.template?.id || null,
  }
}

function DayButton({
  date,
  data,
  selected,
  today,
  loading,
  onClick,
  buttonRef,
}: {
  date: string
  data?: ScheduleAgendaSlotsResponse
  selected: boolean
  today: boolean
  loading: boolean
  onClick: () => void
  buttonRef?: Ref<HTMLButtonElement>
}) {
  const free = data?.slots.filter((slot) => slot.available).length || 0
  const occupied = (data?.slots.length || 0) - free
  const dateValue = parseInputDate(date)

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={cn(
        'min-w-0 rounded-lg px-2.5 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 sm:px-3',
        selected
          ? 'bg-slate-900 text-white shadow-sm'
          : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
      )}
      aria-pressed={selected}
      aria-label={`Ver agenda de ${formatDateHeading(date)}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn(
          'text-[10px] font-semibold uppercase tracking-[0.12em]',
          selected ? 'text-slate-300' : 'text-slate-500'
        )}>
          {dateValue.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
        </span>
        {today ? (
          <span className={cn(
            'rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
            selected ? 'bg-white/15 text-white' : 'bg-primary-100 text-primary-700'
          )}>
            Hoje
          </span>
        ) : null}
      </div>
      <p className={cn('mt-1 text-lg font-semibold', selected ? 'text-white' : 'text-slate-950')}>
        {dateValue.toLocaleDateString('pt-BR', { day: '2-digit' })}
      </p>
      {loading ? (
        <p className={cn('mt-1 text-[10px]', selected ? 'text-slate-300' : 'text-slate-400')}>Carregando...</p>
      ) : data?.allowed ? (
        <p className={cn('mt-1 truncate text-[10px]', selected ? 'text-slate-300' : 'text-slate-500')}>
          <strong className={cn('font-semibold', selected ? 'text-white' : 'text-cyan-700')}>{free}</strong> livres
          {occupied ? <> · <strong className={cn('font-semibold', selected ? 'text-white' : 'text-slate-700')}>{occupied}</strong> ocupados</> : null}
        </p>
      ) : (
        <p className={cn('mt-1 truncate text-[10px] font-medium', selected ? 'text-slate-300' : 'text-slate-400')}>Sem atendimento</p>
      )}
    </button>
  )
}

function AppointmentActionsMenu({
  appointment,
  templateId,
  onOperation,
}: {
  appointment: CalendarAppointment
  templateId?: string | null
  onOperation: (operation: AppointmentOperation) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <Button
        ref={triggerRef}
        size="icon"
        className="h-9 w-9"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Mais ações para ${appointment.patientName}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-30 w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {dynamicPsychologyFormsEnabled && templateId ? (
            <Link
              href={`/formularios/${templateId}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              <Wrench className="h-4 w-4 text-primary-600" aria-hidden="true" />
              Editar modelo
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOperation('reschedule')
            }}
            className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Remarcar
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOperation('no_show')
            }}
            className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            <UserX className="h-4 w-4" aria-hidden="true" />
            Registrar falta
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOperation('cancel')
            }}
            className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Cancelar consulta
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function AgendaCalendarView({ agendaId }: { agendaId: string }) {
  const router = useRouter()
  const today = dateToInput(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [filter, setFilter] = useState<SlotFilter>('all')
  const [quickModalOpen, setQuickModalOpen] = useState(false)
  const [initialSlot, setInitialSlot] = useState<string | null>(null)
  const [operation, setOperation] = useState<AppointmentOperation | null>(null)
  const [operationAppointment, setOperationAppointment] = useState<CalendarAppointment | null>(null)
  const selectedDayButtonRef = useRef<HTMLButtonElement>(null)

  const month = selectedDate.slice(0, 7)
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate])
  const agendasQuery = useQuery({
    queryKey: ['schedule-agendas'],
    queryFn: () => api.schedule.agendas(),
  })
  const calendarQuery = useQuery({
    queryKey: ['agenda-calendar', agendaId, month],
    queryFn: () => api.schedule.agendaCalendar(agendaId, month),
  })
  const weekQueries = useQueries({
    queries: weekDates.map((date) => ({
      queryKey: ['agenda-slots', agendaId, date],
      queryFn: () => api.schedule.agendaSlots(agendaId, date),
      staleTime: 30_000,
    })),
  })

  const selectedDayIndex = weekDates.indexOf(selectedDate)
  const selectedDayQuery = selectedDayIndex >= 0 ? weekQueries[selectedDayIndex] : null
  const selectedDayData = selectedDayQuery?.data
  const selectedAgenda =
    calendarQuery.data?.agenda || agendasQuery.data?.agendas.find((agenda) => agenda.id === agendaId)
  const selectedAgendaMetadata = selectedAgenda as (ScheduleAgenda & AgendaRuntimeMetadata) | undefined
  const agendaSpecialtyCode =
    selectedAgendaMetadata?.specialtyCode ||
    (selectedAgenda?.specialty.toLowerCase() === 'psicologia' ? 'psicologia' : '')
  const agendaFormsQuery = useQuery({
    queryKey: ['agenda-published-form-options', agendaSpecialtyCode],
    queryFn: () => listPublishedAgendaForms(agendaSpecialtyCode),
    enabled: dynamicPsychologyFormsEnabled && agendaSpecialtyCode === 'psicologia',
    retry: false,
  })
  const agendaFormOptions = agendaFormsQuery.data || []
  const explicitAgendaFormOption = agendaFormOptions.find(
    (item) => item.id === selectedAgendaMetadata?.formTemplateId
  )
  const agendaFormOption = selectedAgendaMetadata?.formTemplateId
    ? explicitAgendaFormOption
    : agendaFormOptions.find((item) => item.isDefault)
  const formContext = getAgendaFormContext(selectedAgenda, agendaFormOption)
  const configurableFormId = selectedAgendaMetadata?.formTemplateId || agendaFormOption?.id || null
  const canConfigureForm =
    dynamicPsychologyFormsEnabled && agendaSpecialtyCode === 'psicologia'
  const selectedSlots = selectedDayData?.slots || []
  const visibleSlots = selectedSlots.filter((slot) => matchesFilter(slot, filter))
  const freeCount = selectedSlots.filter((slot) => slot.available).length
  const occupiedCount = selectedSlots.length - freeCount
  const filterCounts: Record<SlotFilter, number> = {
    all: selectedSlots.length,
    free: freeCount,
    reserved: selectedSlots.filter(
      (slot) => !slot.available && appointmentStatus(slot.appointment?.status) === 'reserved'
    ).length,
    in_progress: selectedSlots.filter(
      (slot) => !slot.available && appointmentStatus(slot.appointment?.status) === 'in_progress'
    ).length,
    completed: selectedSlots.filter(
      (slot) => !slot.available && appointmentStatus(slot.appointment?.status) === 'completed'
    ).length,
  }

  const openOperation = (appointment: CalendarAppointment, nextOperation: AppointmentOperation) => {
    setOperationAppointment(appointment)
    setOperation(nextOperation)
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      selectedDayButtonRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedDate])

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-col gap-3 p-3 sm:p-4 lg:p-5">
      <AgendaQuickScheduleModal
        agendaId={agendaId}
        open={quickModalOpen}
        date={selectedDate}
        initialSlot={initialSlot}
        onClose={() => {
          setQuickModalOpen(false)
          setInitialSlot(null)
        }}
      />
      <AppointmentOperationDialog
        appointment={operationAppointment}
        operation={operation}
        onClose={() => {
          setOperation(null)
          setOperationAppointment(null)
        }}
      />

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="agenda-title">
        <div className="flex flex-col gap-4 px-4 py-4 lg:px-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
              <Stethoscope className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 id="agenda-title" className="truncate text-xl font-semibold text-slate-950">
                  {selectedAgenda?.title || 'Agenda'}
                </h1>
                {selectedAgenda ? (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      selectedAgenda.status === 'ativa'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {selectedAgenda.status === 'ativa' ? 'Ativa' : 'Inativa'}
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <BrainCircuit className="h-3.5 w-3.5 text-primary-600" aria-hidden="true" />
                  {selectedAgenda?.specialty || 'Carregando especialidade'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-cyan-600" aria-hidden="true" />
                  <strong className="font-medium text-slate-700">{formContext.name}</strong>
                  <span className="hidden sm:inline">· {formContext.detail}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canConfigureForm ? (
              <Link
                href={configurableFormId ? `/formularios/${configurableFormId}` : '/formularios'}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-primary-200 bg-primary-50 px-3 text-sm font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-100"
              >
                <Wrench className="h-4 w-4" aria-hidden="true" />
                {configurableFormId ? 'Configurar formulário' : 'Criar ou escolher formulário'}
              </Link>
            ) : null}
            <Link
              href="/settings"
              aria-label="Configurar agenda"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Configurar agenda</span>
            </Link>
            <Button variant="primary" className="min-h-10" onClick={() => setQuickModalOpen(true)}>
              <CalendarPlus className="h-4 w-4" />
              Agendar
            </Button>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 lg:px-5">
          <label htmlFor="agenda-select" className="sr-only">Selecionar agenda</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Visualizando</span>
            <select
              id="agenda-select"
              value={agendaId}
              onChange={(event) => router.push(`/agendas/${event.target.value}`)}
              className="form-input max-w-md bg-white py-1.5 text-sm"
            >
              {(agendasQuery.data?.agendas || []).map((agenda) => (
                <option key={agenda.id} value={agenda.id}>
                  {agenda.specialty} · {agenda.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Navegação por período">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-5">
          <div>
            <p className="text-base font-semibold text-slate-950">{formatMonth(selectedDate)}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Semana de {formatWeekRange(weekDates)} · {calendarQuery.data?.stats.scheduledThisMonthCount || 0} no mês
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="icon"
              className="h-9 w-9"
              onClick={() => setSelectedDate(shiftDate(selectedDate, -7))}
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button className="h-9 px-3" onClick={() => setSelectedDate(today)}>
              Hoje
            </Button>
            <label htmlFor="agenda-date" className="sr-only">Ir para a data</label>
            <input
              id="agenda-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="form-input h-9 w-auto py-1.5 text-sm"
            />
            <Button
              size="icon"
              className="h-9 w-9"
              onClick={() => setSelectedDate(shiftDate(selectedDate, 7))}
              aria-label="Próxima semana"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="scrollbar-hide overflow-x-auto p-2 sm:p-3">
          <div className="grid min-w-[680px] grid-cols-7 gap-1.5">
            {weekDates.map((date, index) => (
              <DayButton
                key={date}
                date={date}
                data={weekQueries[index].data}
                selected={selectedDate === date}
                today={date === today}
                loading={weekQueries[index].isLoading}
                onClick={() => setSelectedDate(date)}
                buttonRef={selectedDate === date ? selectedDayButtonRef : undefined}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="day-timeline-title">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">
              Linha do tempo do dia
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 id="day-timeline-title" className="text-base font-semibold text-slate-950">{formatDateHeading(selectedDate)}</h2>
              {selectedDayData?.allowed ? (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                    {selectedSlots.length} horários
                  </span>
                  <span className="rounded-full bg-cyan-50 px-2 py-1 text-cyan-700">
                    {freeCount} livres
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                    {occupiedCount} ocupados
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className="scrollbar-hide flex max-w-full overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-0.5"
            aria-label="Filtrar horários"
            role="group"
          >
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                aria-label={`${item.label}: ${filterCounts[item.id]} horário(s)`}
                className={cn(
                  'whitespace-nowrap rounded px-2.5 py-1.5 text-xs font-medium',
                  filter === item.id
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                )}
                aria-pressed={filter === item.id}
              >
                {item.label}
                <span aria-hidden="true" className={cn('ml-1 text-[10px]', filter === item.id ? 'text-slate-500' : 'text-slate-400')}>
                  {filterCounts[item.id]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {!selectedDayQuery || selectedDayQuery.isLoading ? (
          <LoadingState label="Carregando horários do dia..." />
        ) : selectedDayQuery.isError ? (
          <ErrorState
            message={selectedDayQuery.error.message}
            onRetry={() => void selectedDayQuery.refetch()}
          />
        ) : !selectedDayData?.allowed ? (
          <EmptyState
            title="Dia indisponível para atendimento"
            description={selectedDayData?.reason || 'A agenda não libera horários nesta data.'}
          />
        ) : !visibleSlots.length ? (
          <EmptyState
            title="Nenhum horário neste filtro"
            description="Escolha outro status para visualizar a linha do tempo do dia."
          />
        ) : (
          <div className="min-h-[280px] bg-slate-50/40 px-3 py-4 sm:px-5">
            <ol className="mx-auto max-w-6xl space-y-2.5">
              {visibleSlots.map((slot) => {
                const status = getSlotStatus(slot)
                const appointment = slot.appointment
                const canManage =
                  appointment && appointmentStatus(appointment.status) === 'reserved'
                const appointmentMetadata = appointment as
                  | (CalendarAppointment & AppointmentRuntimeMetadata)
                  | null
                const currentTemplateOption = appointmentMetadata?.scheduleFormTemplateId
                  ? agendaFormOptions.find(
                      (item) => item.id === appointmentMetadata.scheduleFormTemplateId
                    )
                  : undefined
                const pinnedOption = appointmentMetadata?.formTemplateVersionId
                  ? agendaFormOptions.find(
                      (item) => item.latestVersion?.id === appointmentMetadata.formTemplateVersionId
                    ) ||
                    (currentTemplateOption
                      ? { ...currentTemplateOption, latestVersion: null }
                      : undefined)
                  : currentTemplateOption
                const runtime = appointment ? getAppointmentContext(appointment, pinnedOption) : null

                return (
                  <li
                    key={slot.isoDateTime}
                    className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-start gap-2.5 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-3"
                  >
                    <time
                      dateTime={slot.isoDateTime}
                      className="flex items-center justify-end gap-1.5 pt-3 text-right text-sm font-semibold tabular-nums text-slate-900"
                    >
                      <span className={cn('h-2 w-2 shrink-0 rounded-full border', status.dotClass)} aria-hidden="true" />
                      {slot.label}
                    </time>
                    <article
                      className={cn(
                        'min-w-0 rounded-xl border px-3 py-3 sm:px-4',
                        slot.available
                          ? 'border-dashed shadow-none'
                          : 'shadow-sm transition-shadow hover:shadow-md',
                        status.cardClass
                      )}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className={cn('truncate text-sm font-semibold', slot.available ? 'text-slate-700' : 'text-slate-950')}>
                              {appointment?.patientName || 'Horário disponível'}
                            </h3>
                            {!slot.available ? (
                              <span
                                className={cn(
                                  'rounded-full px-2 py-1 text-[10px] font-semibold',
                                  status.badgeClass
                                )}
                              >
                                {status.label}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {appointment?.chiefComplaint || `${slot.shiftLabel} · disponível para agendamento`}
                          </p>

                          {runtime &&
                          (runtime.formName || runtime.consentLabel || runtime.aiLabel) ? (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {runtime.formName ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-1 text-[10px] font-medium text-primary-700">
                                  <FileText className="h-3 w-3" aria-hidden="true" />
                                  {runtime.formName}
                                  {runtime.version ? ` · v${runtime.version}` : ''}
                                </span>
                              ) : null}
                              {runtime.consentLabel ? (
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium',
                                    runtime.consentPositive
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-amber-50 text-amber-700'
                                  )}
                                >
                                  {runtime.consentPositive ? (
                                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                                  ) : (
                                    <CircleAlert className="h-3 w-3" aria-hidden="true" />
                                  )}
                                  {runtime.consentLabel}
                                </span>
                              ) : null}
                              {runtime.aiLabel ? (
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium',
                                    runtime.aiPositive
                                      ? 'bg-cyan-50 text-cyan-700'
                                      : 'bg-slate-100 text-slate-600'
                                  )}
                                >
                                  {runtime.aiPositive ? (
                                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                                  ) : (
                                    <BrainCircuit className="h-3 w-3" aria-hidden="true" />
                                  )}
                                  {runtime.aiLabel}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                          {slot.available ? (
                            <Button
                              size="sm"
                              onClick={() => {
                                setInitialSlot(slot.isoDateTime)
                                setQuickModalOpen(true)
                              }}
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                              Agendar
                            </Button>
                          ) : appointment ? (
                            <>
                              <Link
                                href={`/consultations/${appointment.id}`}
                                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                aria-label={`Abrir consulta de ${appointment.patientName}`}
                              >
                                {appointmentStatus(appointment.status) === 'completed' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <ExternalLink className="h-3.5 w-3.5" />
                                )}
                                Abrir
                              </Link>
                              {canManage ? (
                                <AppointmentActionsMenu
                                  appointment={appointment}
                                  templateId={runtime?.templateId}
                                  onOperation={(nextOperation) => openOperation(appointment, nextOperation)}
                                />
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

      </section>

      {agendasQuery.isError ? (
        <ErrorState
          message={agendasQuery.error.message}
          onRetry={() => void agendasQuery.refetch()}
        />
      ) : null}
      {calendarQuery.isError ? (
        <ErrorState
          message={calendarQuery.error.message}
          onRetry={() => void calendarQuery.refetch()}
        />
      ) : null}
    </div>
  )
}
