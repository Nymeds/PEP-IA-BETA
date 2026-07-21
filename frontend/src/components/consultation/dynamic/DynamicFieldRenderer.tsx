'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bot, ChevronDown, CircleAlert, LayoutGrid, Plus, Quote, Trash2 } from 'lucide-react'
import type {
  ClinicalFormElement,
  ClinicalFormTab,
  DynamicFieldValue,
  RepeaterColumnDefinition,
} from '@/types/forms'
import { cn } from '@/components/shared/utils'
import {
  FORM_CANVAS_WIDTH,
  resolveDynamicCanvasLayout,
} from '@/lib/form-layout'

interface FieldProps {
  field: ClinicalFormElement
  value: unknown
  metadata?: DynamicFieldValue
  instanceId?: 'mobile' | 'desktop'
  disabled?: boolean
  onChange: (value: unknown) => void
}

const COLOR_STYLES = {
  azul: { border: 'border-blue-200', accent: 'bg-blue-500', soft: 'bg-blue-50 text-blue-700', title: 'text-blue-900' },
  verde: { border: 'border-emerald-200', accent: 'bg-emerald-500', soft: 'bg-emerald-50 text-emerald-700', title: 'text-emerald-900' },
  amarelo: { border: 'border-amber-200', accent: 'bg-amber-400', soft: 'bg-amber-50 text-amber-800', title: 'text-amber-900' },
  vermelho: { border: 'border-red-200', accent: 'bg-red-500', soft: 'bg-red-50 text-red-700', title: 'text-red-900' },
  roxo: { border: 'border-violet-200', accent: 'bg-violet-500', soft: 'bg-violet-50 text-violet-700', title: 'text-violet-900' },
  cinza: { border: 'border-slate-200', accent: 'bg-slate-500', soft: 'bg-slate-100 text-slate-700', title: 'text-slate-900' },
  turquesa: { border: 'border-cyan-200', accent: 'bg-cyan-500', soft: 'bg-cyan-50 text-cyan-700', title: 'text-cyan-900' },
  rosa: { border: 'border-rose-200', accent: 'bg-rose-500', soft: 'bg-rose-50 text-rose-700', title: 'text-rose-900' },
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

const CONTROL_CLASS = 'form-input min-h-11 rounded-lg border-slate-300 bg-white px-3.5 text-[15px] shadow-none transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-primary-400 focus:bg-white focus:ring-4 focus:ring-primary-100'

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
        <div key={`${field.id}-row-${rowIndex}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
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
                : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300 hover:bg-white',
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
        className={cn(CONTROL_CLASS, 'min-h-32 resize-y py-3 leading-6')}
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
      <div className={cn('flex min-h-full items-center rounded-xl border border-l-4 px-5 py-4', theme.border, theme.soft)}>
        <h3 className={cn('text-lg font-bold tracking-tight', TITLE_STYLES[field.color])}>{field.label}</h3>
      </div>
    )
  }
  if (field.type === 'divisor') {
    return (
      <div className="flex min-h-full items-center gap-3" aria-hidden="true">
        <span className={cn('h-2 w-2 rounded-full', theme.accent)} />
        <div className={cn('h-px flex-1 opacity-40', theme.accent)} />
      </div>
    )
  }

  return (
    <div className="relative min-h-full rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-colors hover:border-slate-300">
      <div className="mb-3 flex items-start justify-between gap-3">
        <label htmlFor={`dynamic-field-${field.id}-${instanceId}`} className="flex min-w-0 items-start gap-2 text-sm font-semibold leading-5 text-slate-900">
          <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', theme.accent)} aria-hidden="true" />
          <span>{field.label}{field.required ? <span className="text-red-600"> *</span> : null}</span>
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
      {field.helpText ? <p className="mb-3 text-xs leading-5 text-slate-500">{field.helpText}</p> : null}
      <div>
        <FieldInput {...props} />
      </div>
      {field.type === 'selecao_multipla' ? (
        <p id={`${field.id}-multiple-help`} className="mt-1 text-[10px] text-slate-500">
          Selecione uma ou mais opções.
        </p>
      ) : null}
      {showEvidence && status ? (
        <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3" role="status">
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
                    {evidence.speakerLabel || 'Voz não identificada'} · trecho {evidence.sequence}
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

function MeasuredDesktopField({
  fieldId,
  minHeight,
  onHeightChange,
  children,
}: {
  fieldId: string
  minHeight: number
  onHeightChange: (fieldId: string, height: number) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const measure = () => onHeightChange(fieldId, Math.ceil(element.getBoundingClientRect().height))
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [fieldId, onHeightChange])

  return (
    <div ref={ref} className="min-h-full" style={{ minHeight }}>
      {children}
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
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({})
  const ordered = useMemo(
    () => [...tab.elements].sort((left, right) => left.layout.mobileOrder - right.layout.mobileOrder),
    [tab.elements]
  )
  const resolvedLayouts = useMemo(
    () => resolveDynamicCanvasLayout(tab.elements, measuredHeights),
    [measuredHeights, tab.elements]
  )
  const canvasHeight = Math.max(
    420,
    ...Object.values(resolvedLayouts).map((layout) => layout.y + layout.height + 40)
  )
  const tabTheme = COLOR_STYLES[tab.color]

  const handleHeightChange = useCallback((fieldId: string, height: number) => {
    setMeasuredHeights((current) => {
      if (Math.abs((current[fieldId] || 0) - height) <= 1) return current
      return { ...current, [fieldId]: height }
    })
  }, [])

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
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tabTheme.soft)}>
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold tracking-tight text-slate-950">{tab.label}</h2>
            <p className="mt-1 text-xs text-slate-500">
              Preencha somente as informações pertinentes a este atendimento.
            </p>
          </div>
        </div>
        <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-600 sm:inline-flex">
          {tab.elements.length} {tab.elements.length === 1 ? 'campo' : 'campos'}
        </span>
      </header>

      <div className="space-y-4 bg-slate-50 p-4 sm:p-5 lg:hidden">
        {ordered.map((field) => renderField(field, 'mobile'))}
      </div>
      <div className="hidden bg-slate-50 p-6 lg:block">
        <div
          className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white"
          style={{
            height: canvasHeight,
          }}
        >
          {tab.elements.map((field) => {
            const layout = resolvedLayouts[field.id]
            if (!layout) return null
            return (
              <div
                key={field.id}
                className="absolute"
                style={{
                  left: `${(layout.x / FORM_CANVAS_WIDTH) * 100}%`,
                  top: layout.y,
                  width: `${(layout.width / FORM_CANVAS_WIDTH) * 100}%`,
                  minHeight: layout.height,
                  zIndex: layout.zIndex,
                }}
              >
                <MeasuredDesktopField
                  fieldId={field.id}
                  minHeight={field.layout.height}
                  onHeightChange={handleHeightChange}
                >
                  {renderField(field, 'desktop')}
                </MeasuredDesktopField>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
