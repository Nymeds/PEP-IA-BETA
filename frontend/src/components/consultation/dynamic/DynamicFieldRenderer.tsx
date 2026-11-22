'use client'

import { useMemo, useState } from 'react'
import { Bot, ChevronDown, CircleAlert, LayoutGrid, Plus, Quote, Trash2 } from 'lucide-react'
import type {
  ClinicalFormElement,
  ClinicalFormTab,
  DynamicFieldValue,
  RepeaterColumnDefinition,
} from '@/types/forms'
import { cn } from '@/components/shared/utils'
import { FormFieldIcon, isFormFieldIconName } from '@/components/forms/FormFieldIcon'
import { FORM_CANVAS_WIDTH } from '@/lib/form-layout'
import { safeSpeakerDisplayName } from './dynamic-voice-readiness'

interface FieldProps {
  field: ClinicalFormElement
  value: unknown
  metadata?: DynamicFieldValue
  instanceId?: 'mobile' | 'desktop'
  disabled?: boolean
  onChange: (value: unknown) => void
}

const COLOR_STYLES = {
  azul: { border: 'border-blue-200/80', accent: 'bg-blue-600', soft: 'bg-blue-50 text-blue-700', icon: 'border-blue-500 bg-blue-50 text-blue-600', title: 'text-blue-950' },
  verde: { border: 'border-emerald-200/80', accent: 'bg-emerald-600', soft: 'bg-emerald-50 text-emerald-700', icon: 'border-emerald-500 bg-emerald-50 text-emerald-600', title: 'text-emerald-950' },
  amarelo: { border: 'border-amber-200/80', accent: 'bg-amber-500', soft: 'bg-amber-50 text-amber-800', icon: 'border-amber-500 bg-amber-50 text-amber-600', title: 'text-amber-950' },
  vermelho: { border: 'border-red-200/80', accent: 'bg-red-600', soft: 'bg-red-50 text-red-700', icon: 'border-red-500 bg-red-50 text-red-600', title: 'text-red-950' },
  roxo: { border: 'border-violet-200/80', accent: 'bg-violet-600', soft: 'bg-violet-50 text-violet-700', icon: 'border-violet-500 bg-violet-50 text-violet-600', title: 'text-violet-950' },
  cinza: { border: 'border-slate-200/90', accent: 'bg-slate-500', soft: 'bg-slate-100 text-slate-700', icon: 'border-slate-500 bg-slate-100 text-slate-600', title: 'text-slate-950' },
  turquesa: { border: 'border-cyan-200/80', accent: 'bg-cyan-600', soft: 'bg-cyan-50 text-cyan-700', icon: 'border-cyan-500 bg-cyan-50 text-cyan-600', title: 'text-cyan-950' },
  rosa: { border: 'border-rose-200/80', accent: 'bg-rose-600', soft: 'bg-rose-50 text-rose-700', icon: 'border-rose-500 bg-rose-50 text-rose-600', title: 'text-rose-950' },
} as const

const TITLE_STYLES = {
  azul: 'text-blue-800',
  verde: 'text-emerald-800',
  amarelo: 'text-amber-800',
  vermelho: 'text-red-800',
  roxo: 'text-violet-800',
  cinza: 'text-slate-800',
  turquesa: 'text-cyan-800',
  rosa: 'text-rose-800',
} as const

const CONTROL_CLASS = 'form-input min-h-11 rounded-lg border-slate-300/80 bg-white px-3.5 text-[15px] shadow-[0_1px_2px_rgba(15,23,42,0.035)] transition-[border-color,box-shadow] placeholder:text-slate-400 hover:border-slate-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100'

const RUNTIME_GRID_COLUMNS = 24
const RUNTIME_ROW_TOLERANCE = 24

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function resolveRuntimeGrid(elements: ClinicalFormElement[]) {
  const columnWidth = FORM_CANVAS_WIDTH / RUNTIME_GRID_COLUMNS
  const rowAnchors: number[] = []
  const sorted = [...elements].sort((left, right) =>
    left.layout.y - right.layout.y ||
    left.layout.x - right.layout.x ||
    left.layout.mobileOrder - right.layout.mobileOrder
  )

  return sorted.map((field) => {
    let rowIndex = rowAnchors.findIndex(
      (anchor) => Math.abs(anchor - field.layout.y) <= RUNTIME_ROW_TOLERANCE
    )
    if (rowIndex < 0) {
      rowAnchors.push(field.layout.y)
      rowIndex = rowAnchors.length - 1
    }

    const columnStart = clamp(Math.round(field.layout.x / columnWidth) + 1, 1, RUNTIME_GRID_COLUMNS)
    const requestedSpan = Math.max(3, Math.round(field.layout.width / columnWidth))
    const columnSpan = clamp(requestedSpan, 1, RUNTIME_GRID_COLUMNS - columnStart + 1)

    return {
      field,
      row: rowIndex + 1,
      columnStart,
      columnSpan,
    }
  })
}

function aiStatus(metadata?: DynamicFieldValue) {
  if (metadata?.source !== 'ia') return null
  if (metadata.reviewStatus === 'revisao_obrigatoria') {
    return {
      label: 'Preenchido pela IA — revisão obrigatória',
      className: 'border-amber-300 bg-amber-50 text-amber-700',
      icon: CircleAlert,
    }
  }
  if (metadata.reviewStatus === 'provisorio') {
    return {
      label: 'Preenchimento provisório da IA',
      className: 'border-dashed border-blue-400 bg-blue-50 text-blue-700',
      icon: Bot,
    }
  }
  return {
    label: 'Preenchido pela IA — não revisado',
    className: 'border-blue-300 bg-blue-50 text-blue-700',
    icon: Bot,
  }
}

function defaultColumnValue(column: RepeaterColumnDefinition) {
  if (column.type === 'checkbox') return false
  if (column.type === 'numero') return 0
  if (column.type === 'selecao_multipla') return []
  return ''
}

function RepeaterInput({ field, value, disabled, onChange }: FieldProps) {
  const rows = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
  const columns = field.columns || []

  const updateCell = (rowIndex: number, column: RepeaterColumnDefinition, next: unknown) => {
    onChange(rows.map((row, index) => index === rowIndex ? { ...row, [column.id]: next } : row))
  }

  const addRow = () => {
    const row = Object.fromEntries(
      columns.filter((column) => column.required).map((column) => [column.id, defaultColumnValue(column)])
    )
    onChange([...rows, row])
  }

  return (
    <div className="space-y-2">
      {rows.map((row, rowIndex) => (
        <div key={`${field.id}-row-${rowIndex}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Item {rowIndex + 1}
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(rows.filter((_, index) => index !== rowIndex))}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
              aria-label={`Remover item ${rowIndex + 1} de ${field.label}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {columns.map((column) => (
              <label key={column.id} className="text-sm text-slate-700">
                <span className="mb-1.5 block font-semibold text-slate-800">
                  {column.label}{column.required ? ' *' : ''}
                </span>
                {column.type === 'checkbox' ? (
                  <span className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
                    <input
                      type="checkbox"
                      checked={Boolean(row[column.id])}
                      disabled={disabled}
                      onChange={(event) => updateCell(rowIndex, column, event.target.checked)}
                    />
                    Sim
                  </span>
                ) : column.type === 'selecao_unica' ? (
                  <select
                    value={String(row[column.id] ?? '')}
                    disabled={disabled}
                    onChange={(event) => updateCell(rowIndex, column, event.target.value)}
                    className={CONTROL_CLASS}
                  >
                    <option value="">Selecione</option>
                    {(column.options || []).map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                ) : column.type === 'selecao_multipla' ? (
                  <select
                    multiple
                    value={Array.isArray(row[column.id]) ? row[column.id] as string[] : []}
                    disabled={disabled}
                    onChange={(event) => updateCell(
                      rowIndex,
                      column,
                      Array.from(event.target.selectedOptions, (option) => option.value)
                    )}
                    className={cn(CONTROL_CLASS, 'min-h-24 py-2 text-sm')}
                  >
                    {(column.options || []).map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={column.type === 'numero' ? 'number' : column.type === 'data' ? 'date' : 'text'}
                    value={String(row[column.id] ?? '')}
                    disabled={disabled}
                    onChange={(event) => updateCell(
                      rowIndex,
                      column,
                      column.type === 'numero' && event.target.value !== ''
                        ? Number(event.target.value)
                        : event.target.value
                    )}
                    className={CONTROL_CLASS}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        disabled={disabled}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar item
      </button>
    </div>
  )
}

function FieldInput(props: FieldProps) {
  const { field, value, disabled, onChange, instanceId = 'desktop' } = props
  const inputId = `dynamic-field-${field.id}-${instanceId}`
  if (field.type === 'grupo_repetivel') return <RepeaterInput {...props} />
  if (field.type === 'checkbox') {
    return (
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400">
        <input
          id={inputId}
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          required={field.required}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 rounded-md border-slate-300 text-primary-600 focus:ring-primary-500"
        />
        {Boolean(value) ? 'Sim' : 'Não'}
      </label>
    )
  }
  if (field.type === 'selecao_unica') {
    return (
      <select
        id={inputId}
        value={String(value ?? '')}
        disabled={disabled}
        required={field.required}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL_CLASS}
      >
        <option value="">Selecione uma opção</option>
        {(field.options || []).map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    )
  }
  if (field.type === 'selecao_multipla') {
    const selected = Array.isArray(value) ? value as string[] : []
    return (
      <div
        id={inputId}
        role="group"
        aria-label={field.label}
        aria-describedby={`${field.id}-multiple-help`}
        className="grid gap-2 sm:grid-cols-2"
      >
        {(field.options || []).map((option) => (
          <label
            key={option.id}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm transition-colors',
              selected.includes(option.id)
                ? 'border-primary-300 bg-primary-50 font-medium text-primary-800'
                : 'border-slate-300/80 bg-white text-slate-700 hover:border-slate-400',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              disabled={disabled}
              onChange={(event) => onChange(
                event.target.checked
                  ? [...selected, option.id]
                  : selected.filter((current) => current !== option.id)
              )}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            {option.label}
          </label>
        ))}
      </div>
    )
  }
  if (field.type === 'texto_longo') {
    return (
      <textarea
        id={inputId}
        value={String(value ?? '')}
        disabled={disabled}
        required={field.required}
        minLength={field.validation?.minLength}
        maxLength={field.validation?.maxLength}
        onChange={(event) => onChange(event.target.value)}
        className={cn(CONTROL_CLASS, 'min-h-24 resize-y py-3 leading-6')}
      />
    )
  }
  return (
    <input
      id={inputId}
      type={field.type === 'numero' ? 'number' : field.type === 'data' ? 'date' : 'text'}
      value={String(value ?? '')}
      disabled={disabled}
      required={field.required}
      min={field.type === 'numero' ? field.validation?.min : undefined}
      max={field.type === 'numero' ? field.validation?.max : undefined}
      minLength={field.type === 'texto_curto' ? field.validation?.minLength : undefined}
      maxLength={field.type === 'texto_curto' ? field.validation?.maxLength : undefined}
      onChange={(event) => onChange(
        field.type === 'numero' && event.target.value !== ''
          ? Number(event.target.value)
          : event.target.value
      )}
      className={CONTROL_CLASS}
    />
  )
}

export function DynamicFieldRenderer(props: FieldProps) {
  const { field, metadata, instanceId = 'desktop' } = props
  const [showEvidence, setShowEvidence] = useState(false)
  const status = aiStatus(metadata)
  const theme = COLOR_STYLES[field.color]
  const fieldIcon = isFormFieldIconName(field.icon) ? field.icon : undefined
  const StatusIcon = status?.icon
  const evidenceItems = metadata?.evidence || []
  const confidenceLabel = metadata?.confidence === 'high'
    ? 'alta'
    : metadata?.confidence === 'medium' ? 'média' : metadata?.confidence === 'low' ? 'baixa' : null
  const formatTime = (milliseconds: number | null) => {
    if (milliseconds == null) return null
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
    return `${Math.floor(totalSeconds / 60).toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`
  }

  if (field.type === 'titulo') {
    return (
      <div className="flex min-h-full items-end border-b border-slate-200 px-2 pb-3">
        <span className={cn('mr-2.5 h-5 w-1 rounded-full', theme.accent)} aria-hidden="true" />
        <h3 className={cn('text-base font-semibold tracking-tight', TITLE_STYLES[field.color])}>{field.label}</h3>
      </div>
    )
  }
  if (field.type === 'divisor') {
    return (
      <div className="flex min-h-full items-center px-2" aria-hidden="true">
        <div className="h-px flex-1 bg-slate-200" />
      </div>
    )
  }

  return (
    <div className="min-h-full px-1">
      <div className={cn('mb-2 flex items-start gap-3', fieldIcon && 'mb-3 items-center')}>
        {fieldIcon ? (
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2', theme.icon)}>
            <FormFieldIcon name={fieldIcon} className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <label htmlFor={`dynamic-field-${field.id}-${instanceId}`} className="min-w-0 text-sm font-medium leading-5 text-slate-800">
              <span>{field.label}{field.required ? <span className="text-red-500"> *</span> : null}</span>
            </label>
            {status ? (
              <button
                type="button"
                onClick={() => setShowEvidence((current) => !current)}
                className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold', status.className)}
                aria-label={status.label}
                aria-expanded={showEvidence}
                title={status.label}
              >
                {StatusIcon ? <StatusIcon className="h-3 w-3" aria-hidden="true" /> : null}
                <span className="hidden xl:inline">IA</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', showEvidence && 'rotate-180')} />
              </button>
            ) : null}
          </div>
          {field.helpText ? <p className="mt-1 text-xs leading-5 text-slate-500">{field.helpText}</p> : null}
        </div>
      </div>
      <div className={cn('relative', !fieldIcon && 'pl-3')}>
        {!fieldIcon ? <span className={cn('absolute inset-y-0 left-0 w-1 rounded-full', theme.accent)} aria-hidden="true" /> : null}
        <FieldInput {...props} />
        {field.type === 'selecao_multipla' ? (
          <p id={`${field.id}-multiple-help`} className="mt-1 text-[10px] text-slate-500">
            Selecione uma ou mais opções.
          </p>
        ) : null}
      </div>
      {showEvidence && status ? (
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3" role="status">
          <p className="text-[11px] font-semibold text-slate-800">{status.label}</p>
          {confidenceLabel ? (
            <p className="mt-1 text-[10px] text-slate-500">Confiança informada pela IA: {confidenceLabel}</p>
          ) : null}
          {metadata?.uncertainty ? (
            <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
              Dúvida: {metadata.uncertainty}
            </p>
          ) : null}
          {evidenceItems.length ? (
            <div className="mt-2 space-y-2">
              {evidenceItems.map((evidence) => (
                <blockquote key={`${evidence.segmentId}-${evidence.sequence}`} className="border-l-2 border-blue-300 pl-2 text-[11px] text-slate-600">
                  <Quote className="mr-1 inline h-3 w-3 text-blue-500" />
                  “{evidence.quote}”
                  <span className="mt-1 block text-[10px] text-slate-400">
                    {safeSpeakerDisplayName(
                      evidence.speakerDisplayName,
                      evidence.participantId || evidence.speakerLabel ? 'identificada' : 'nao_identificada'
                    )} · trecho {evidence.sequence}
                    {formatTime(evidence.startMs)
                      ? ` · ${formatTime(evidence.startMs)}${formatTime(evidence.endMs) ? `–${formatTime(evidence.endMs)}` : ''}`
                      : ' · horário indisponível'}
                  </span>
                </blockquote>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-amber-700">Sem evidência disponível. Revise este valor.</p>
          )}
          {metadata?.history?.length ? (
            <details className="mt-3 border-t border-slate-100 pt-2">
              <summary className="cursor-pointer text-[10px] font-semibold text-slate-600">
                Histórico auditável ({metadata.history.length})
              </summary>
              <ol className="mt-2 space-y-1">
                {metadata.history.slice(0, 10).map((event) => (
                  <li key={event.id} className="text-[10px] text-slate-500">
                    {new Date(event.createdAt).toLocaleString('pt-BR')} · {event.actorType} · {event.operation}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function DynamicTabRenderer({
  tab,
  values,
  metadata,
  disabled,
  onChange,
}: {
  tab: ClinicalFormTab
  values: Record<string, unknown>
  metadata: Record<string, DynamicFieldValue>
  disabled?: boolean
  onChange: (fieldId: string, value: unknown) => void
}) {
  const ordered = useMemo(
    () => [...tab.elements].sort((left, right) => left.layout.mobileOrder - right.layout.mobileOrder),
    [tab.elements]
  )
  const desktopGrid = useMemo(() => resolveRuntimeGrid(tab.elements), [tab.elements])
  const tabTheme = COLOR_STYLES[tab.color]

  const renderField = (field: ClinicalFormElement, instanceId: 'mobile' | 'desktop') => (
    <DynamicFieldRenderer
      key={`${field.id}-${instanceId}`}
      field={field}
      instanceId={instanceId}
      value={values[field.id]}
      metadata={metadata[field.id]}
      disabled={disabled}
      onChange={(value) => onChange(field.id, value)}
    />
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5', tabTheme.soft)}>
            <LayoutGrid className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-slate-950">{tab.label}</h2>
            <p className="mt-1 text-xs text-slate-500">
              Preencha somente as informações pertinentes a este atendimento.
            </p>
          </div>
        </div>
        <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 sm:inline-flex">
          {tab.elements.length} {tab.elements.length === 1 ? 'campo' : 'campos'}
        </span>
      </header>

      <div className="space-y-5 bg-slate-100/70 p-5 sm:p-6 lg:hidden">
        {ordered.map((field) => renderField(field, 'mobile'))}
      </div>
      <div className="hidden bg-slate-100/70 px-6 py-7 lg:block">
        <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-y-6">
          {desktopGrid.map(({ field, row, columnStart, columnSpan }) => {
            return (
              <div
                key={field.id}
                className="min-w-0 px-2"
                style={{
                  gridColumn: `${columnStart} / span ${columnSpan}`,
                  gridRow: row,
                }}
              >
                {renderField(field, 'desktop')}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
