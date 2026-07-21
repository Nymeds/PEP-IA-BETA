'use client'

import { FormEvent, useId, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Pill,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/shared/utils'

export type DynamicMedicationReferenceStatus =
  | 'pendente'
  | 'aceito'
  | 'descartado'
  | 'sem_fonte_oficial'
  | string

export interface DynamicMedicationReferenceContent {
  normalizedName?: string | null
  activeIngredient?: string | null
  description?: string | null
  importantFacts?: string[] | null
}

export interface DynamicMedicationReferenceRecord {
  id?: string
  recordId?: string
  searchedName: string
  normalizedName?: string | null
  sourceTitle?: string | null
  sourceUrl?: string | null
  status: DynamicMedicationReferenceStatus
  consultedAt: string
  reviewedAt?: string | null
  content?: DynamicMedicationReferenceContent | string | null
  activeIngredient?: string | null
  description?: string | null
  importantFacts?: string[] | null
}

export interface DynamicMedicationPanelProps {
  references: readonly DynamicMedicationReferenceRecord[]
  disabled?: boolean
  isSearching?: boolean
  reviewingId?: string | null
  searchError?: string | null
  onSearch: (medicationName: string) => void | Promise<unknown>
  onAccept: (reference: DynamicMedicationReferenceRecord) => void | Promise<unknown>
  onDismiss: (reference: DynamicMedicationReferenceRecord) => void | Promise<unknown>
}

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Aguardando revisão',
  aceito: 'Aceita pelo profissional',
  descartado: 'Descartada',
  sem_fonte_oficial: 'Sem fonte oficial',
}

const STATUS_STYLES: Record<string, string> = {
  pendente: 'border-amber-200 bg-amber-50 text-amber-800',
  aceito: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  descartado: 'border-slate-200 bg-slate-100 text-slate-600',
  sem_fonte_oficial: 'border-red-200 bg-red-50 text-red-800',
}

function referenceId(reference: DynamicMedicationReferenceRecord) {
  return reference.id || reference.recordId || `${reference.searchedName}:${reference.consultedAt}`
}

function parseContent(content: DynamicMedicationReferenceRecord['content']) {
  if (!content) return {}
  if (typeof content !== 'string') return content

  try {
    const parsed = JSON.parse(content) as unknown
    return parsed && typeof parsed === 'object'
      ? parsed as DynamicMedicationReferenceContent
      : {}
  } catch {
    return { description: content }
  }
}

function safeSourceUrl(sourceUrl?: string | null) {
  if (!sourceUrl) return null

  try {
    const url = new URL(sourceUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data não informada'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a ação.'
}

function ReferenceCard({
  reference,
  disabled,
  busy,
  onAccept,
  onDismiss,
}: {
  reference: DynamicMedicationReferenceRecord
  disabled?: boolean
  busy: boolean
  onAccept: () => void
  onDismiss: () => void
}) {
  const content = parseContent(reference.content)
  const officialUrl = safeSourceUrl(reference.sourceUrl)
  const activeIngredient = reference.activeIngredient || content.activeIngredient
  const description = reference.description || content.description
  const importantFacts = reference.importantFacts || content.importantFacts || []
  const canAccept = reference.status === 'pendente' && Boolean(officialUrl)
  const canDismiss = reference.status === 'pendente' || reference.status === 'sem_fonte_oficial'
  const title = reference.normalizedName || content.normalizedName || reference.searchedName

  return (
    <article
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 rounded-lg bg-blue-50 p-1.5 text-blue-700" aria-hidden="true">
              <Pill className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h4 className="break-words text-sm font-semibold text-slate-900">{title}</h4>
              {title !== reference.searchedName ? (
                <p className="mt-0.5 text-[11px] text-slate-500">Busca: {reference.searchedName}</p>
              ) : null}
            </div>
          </div>
        </div>
        <span className={cn(
          'rounded-full border px-2 py-1 text-[10px] font-semibold',
          STATUS_STYLES[reference.status] || 'border-slate-200 bg-slate-50 text-slate-700'
        )}>
          {STATUS_LABELS[reference.status] || reference.status.replaceAll('_', ' ')}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-2.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fonte</dt>
          <dd className="mt-1 break-words font-medium text-slate-800">
            {reference.sourceTitle || (officialUrl ? 'Fonte oficial informada' : 'Nenhuma fonte oficial encontrada')}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5">
          <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <CalendarDays className="h-3 w-3" aria-hidden="true" /> Consulta à fonte
          </dt>
          <dd className="mt-1 font-medium text-slate-800">
            <time dateTime={reference.consultedAt}>{formatDate(reference.consultedAt)}</time>
          </dd>
        </div>
      </dl>

      <div className="mt-3 space-y-2 text-xs text-slate-700">
        {activeIngredient ? (
          <p><span className="font-semibold text-slate-800">Princípio ativo:</span> {activeIngredient}</p>
        ) : null}
        {description ? <p className="leading-relaxed">{description}</p> : null}
        {importantFacts.length ? (
          <div>
            <p className="font-semibold text-slate-800">Informações encontradas</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {importantFacts.slice(0, 5).map((fact, index) => (
                <li key={`${referenceId(reference)}:fact:${index}`}>{fact}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {!description && !activeIngredient && !importantFacts.length ? (
          <p className="text-slate-500">A consulta não retornou conteúdo farmacológico resumido.</p>
        ) : null}
      </div>

      {!officialUrl && reference.status === 'pendente' ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Esta referência não pode ser aceita porque não possui um link oficial válido.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {officialUrl ? (
          <a
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            aria-label={`Abrir fonte oficial de ${title} em uma nova aba`}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Fonte oficial
          </a>
        ) : null}
        {canAccept ? (
          <Button size="sm" variant="primary" onClick={onAccept} disabled={disabled || busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
            Aceitar referência
          </Button>
        ) : null}
        {canDismiss ? (
          <Button size="sm" onClick={onDismiss} disabled={disabled || busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
            Descartar
          </Button>
        ) : null}
      </div>
    </article>
  )
}

export function DynamicMedicationPanel({
  references,
  disabled,
  isSearching,
  reviewingId,
  searchError,
  onSearch,
  onAccept,
  onDismiss,
}: DynamicMedicationPanelProps) {
  const inputId = useId()
  const feedbackId = useId()
  const [name, setName] = useState('')
  const [localSearchBusy, setLocalSearchBusy] = useState(false)
  const [localReviewingId, setLocalReviewingId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const searching = Boolean(isSearching || localSearchBusy)

  const submitSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const medicationName = name.trim()
    if (!medicationName || searching || disabled) return

    setLocalError(null)
    setLocalSearchBusy(true)
    try {
      await onSearch(medicationName)
      setName('')
    } catch (error) {
      setLocalError(errorMessage(error))
    } finally {
      setLocalSearchBusy(false)
    }
  }

  const review = async (
    reference: DynamicMedicationReferenceRecord,
    action: 'accept' | 'dismiss'
  ) => {
    const id = referenceId(reference)
    setLocalError(null)
    setLocalReviewingId(id)
    try {
      await (action === 'accept' ? onAccept(reference) : onDismiss(reference))
    } catch (error) {
      setLocalError(errorMessage(error))
    } finally {
      setLocalReviewingId(null)
    }
  }

  return (
    <section className="space-y-4 p-4" aria-labelledby={`${inputId}-title`}>
      <header>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-700" aria-hidden="true" />
          <h3 id={`${inputId}-title`} className="text-sm font-semibold text-slate-900">
            Referências de medicamentos
          </h3>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
          A busca envia somente o nome do medicamento. Nenhum dado do paciente ou trecho da consulta é enviado.
          A referência precisa ser revisada pelo profissional e não constitui orientação terapêutica.
        </p>
      </header>

      <form onSubmit={submitSearch} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <label htmlFor={inputId} className="text-xs font-semibold text-slate-800">
          Nome do medicamento
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            autoComplete="off"
            spellCheck="false"
            className="form-input min-w-0 flex-1 text-sm"
            placeholder="Ex.: sertralina"
            disabled={disabled || searching}
            aria-describedby={feedbackId}
          />
          <Button type="submit" size="sm" variant="primary" disabled={disabled || searching || !name.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            {searching ? 'Consultando…' : 'Buscar fonte oficial'}
          </Button>
        </div>
        <p id={feedbackId} className="mt-2 text-[10px] text-slate-500">
          Consulte pelo nome informado pelo paciente. Dose, indicação e dados clínicos não são enviados nesta busca.
        </p>
      </form>

      <div aria-live="polite" aria-atomic="true">
        {localError || searchError ? (
          <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800" role="alert">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {localError || searchError}
          </p>
        ) : searching ? (
          <p className="text-xs text-slate-600">Consultando uma fonte oficial segura…</p>
        ) : null}
      </div>

      {references.length ? (
        <div className="space-y-3" aria-label="Referências farmacológicas consultadas">
          {references.map((reference) => {
            const id = referenceId(reference)
            const busy = reviewingId === id || localReviewingId === id
            return (
              <ReferenceCard
                key={id}
                reference={reference}
                disabled={disabled}
                busy={busy}
                onAccept={() => review(reference, 'accept')}
                onDismiss={() => review(reference, 'dismiss')}
              />
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center">
          <Pill className="mx-auto h-5 w-5 text-slate-400" aria-hidden="true" />
          <p className="mt-2 text-xs font-medium text-slate-700">Nenhuma referência consultada</p>
          <p className="mt-1 text-[11px] text-slate-500">Busque um medicamento para conferir a fonte antes de aceitar qualquer informação.</p>
        </div>
      )}
    </section>
  )
}
