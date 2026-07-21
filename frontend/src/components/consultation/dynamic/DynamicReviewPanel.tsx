'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Bot, Check, CheckCircle2, Quote, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react'
import type {
  ClinicalDocumentKind,
  ClinicalFormElement,
  DynamicConsultationRuntime,
  DynamicQuarantineItem,
} from '@/types/forms'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/shared/utils'

interface FieldOption {
  field: ClinicalFormElement
  documentKind: ClinicalDocumentKind
  label: string
}

function parsePayload(item: DynamicQuarantineItem) {
  try {
    return JSON.parse(item.payloadJson || '{}') as {
      fieldId?: string
      documentKind?: ClinicalDocumentKind
      value?: unknown
      valueJson?: string
      uncertainty?: string | null
      confidence?: string
    }
  } catch {
    return {}
  }
}

function toEditorValue(value: unknown) {
  if (value == null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function parseEditorValue(field: ClinicalFormElement | undefined, value: string) {
  if (!field) return value
  if (field.type === 'checkbox') return value === 'true'
  if (field.type === 'numero') return Number(value)
  if (field.type === 'selecao_multipla' || field.type === 'grupo_repetivel') {
    return JSON.parse(value)
  }
  return value
}

function QuarantineCard({
  item,
  fields,
  busy,
  onDismiss,
  onRestore,
}: {
  item: DynamicQuarantineItem
  fields: FieldOption[]
  busy?: boolean
  onDismiss: () => void
  onRestore: (fieldId: string, documentKind: ClinicalDocumentKind, value: unknown) => void
}) {
  const payload = useMemo(() => parsePayload(item), [item])
  const initialOption = fields.find((option) => option.field.id === payload.fieldId && option.documentKind === payload.documentKind)
  const [target, setTarget] = useState(
    initialOption ? `${initialOption.documentKind}:${initialOption.field.id}` : ''
  )
  const initialValue = payload.value !== undefined
    ? payload.value
    : payload.valueJson
      ? (() => {
          try { return JSON.parse(payload.valueJson) as unknown } catch { return payload.valueJson }
        })()
      : item.sourceText || ''
  const [value, setValue] = useState(toEditorValue(initialValue))
  const [parseError, setParseError] = useState<string | null>(null)
  const selected = fields.find((option) => `${option.documentKind}:${option.field.id}` === target)
  const highRisk = item.kind === 'alerta_risco'

  const restore = () => {
    if (!selected) return
    try {
      const parsed = parseEditorValue(selected.field, value)
      setParseError(null)
      onRestore(selected.field.id, selected.documentKind, parsed)
    } catch {
      setParseError('Revise o formato do valor antes de restaurar.')
    }
  }

  return (
    <article className={cn(
      'rounded-xl border p-3',
      highRisk ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
    )}>
      <div className="flex items-start gap-2">
        {highRisk ? (
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        )}
        <div className="min-w-0 flex-1">
          <p className={cn('text-xs font-semibold', highRisk ? 'text-red-900' : 'text-slate-800')}>
            {item.kind.replaceAll('_', ' ')}
          </p>
          <p className={cn('mt-1 text-[11px]', highRisk ? 'text-red-800' : 'text-slate-600')}>
            {item.reason}
          </p>
          {item.sourceText ? (
            <blockquote className="mt-2 border-l-2 border-amber-300 pl-2 text-[11px] italic text-slate-600">
              <Quote className="mr-1 inline h-3 w-3" />“{item.sourceText}”
            </blockquote>
          ) : null}
          {payload.uncertainty ? (
            <p className="mt-2 text-[10px] text-amber-700">Dúvida da IA: {payload.uncertainty}</p>
          ) : null}
        </div>
      </div>

      <details className="mt-3 rounded-lg border border-slate-200 bg-white/80 p-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">Revisar e restaurar manualmente</summary>
        <div className="mt-2 space-y-2">
          <select value={target} onChange={(event) => setTarget(event.target.value)} className="form-input py-1.5 text-xs">
            <option value="">Selecione o campo de destino</option>
            {fields.map((option) => (
              <option key={`${option.documentKind}:${option.field.id}`} value={`${option.documentKind}:${option.field.id}`}>
                {option.label}
              </option>
            ))}
          </select>
          {selected?.field.type === 'checkbox' ? (
            <select value={value} onChange={(event) => setValue(event.target.value)} className="form-input py-1.5 text-xs">
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          ) : (
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="form-input min-h-20 text-xs"
              placeholder={selected?.field.type === 'grupo_repetivel' ? 'Informe um array JSON válido' : 'Valor revisado'}
            />
          )}
          {parseError ? <p className="text-[11px] text-red-700" role="alert">{parseError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={restore} disabled={!selected || !value || busy}>
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar como manual
            </Button>
            <Button size="sm" onClick={onDismiss} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" /> Descartar
            </Button>
          </div>
        </div>
      </details>
    </article>
  )
}

export function DynamicReviewPanel({
  runtime,
  busy,
  onDismiss,
  onRestore,
  onAcceptAiValue,
}: {
  runtime: DynamicConsultationRuntime
  busy?: boolean
  onDismiss: (item: DynamicQuarantineItem) => void
  onRestore: (
    item: DynamicQuarantineItem,
    fieldId: string,
    documentKind: ClinicalDocumentKind,
    value: unknown
  ) => void
  onAcceptAiValue: (
    fieldId: string,
    documentKind: ClinicalDocumentKind,
    value: unknown
  ) => void
}) {
  const fields = useMemo<FieldOption[]>(
    () => runtime.definition.documents.flatMap((document) =>
      document.tabs.flatMap((tab) =>
        tab.elements
          .filter((field) => field.type !== 'titulo' && field.type !== 'divisor')
          .map((field) => ({
            field,
            documentKind: document.kind,
            label: `${document.label} · ${tab.label} · ${field.label}`,
          }))
      )
    ),
    [runtime.definition.documents]
  )
  const pending = runtime.quarantine.filter((item) => item.status === 'pendente')
  const aiValues = runtime.documents.flatMap((document) =>
    Object.entries(document.values)
      .filter(([, field]) => field.source === 'ia' && field.reviewStatus !== 'confirmado')
      .map(([fieldId, field]) => ({ documentKind: document.kind, fieldId, field }))
  )

  return (
    <div className="space-y-4 p-4">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-blue-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Campos da IA</h3>
          </div>
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{aiValues.length}</span>
        </div>
        {aiValues.length ? (
          <div className="space-y-2">
            {aiValues.map(({ documentKind, fieldId, field }) => {
              const definition = fields.find((option) => option.documentKind === documentKind && option.field.id === fieldId)
              return (
                <div key={`${documentKind}:${fieldId}`} className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-blue-900">{definition?.field.label || fieldId}</p>
                    <span className="text-[10px] font-medium text-blue-700">{field.reviewStatus.replaceAll('_', ' ')}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-blue-800">{typeof field.value === 'string' ? field.value : JSON.stringify(field.value)}</p>
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={busy}
                    onClick={() => onAcceptAiValue(fieldId, documentKind, field.value)}
                  >
                    <Check className="h-3.5 w-3.5" /> Confirmar após revisão
                  </Button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-500">
            Nenhum campo preenchido pela IA aguarda revisão.
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Central de revisão</h3>
          </div>
          <span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold', pending.length ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
            {pending.length} pendentes
          </span>
        </div>
        {pending.length ? (
          <div className="space-y-2">
            {pending.map((item) => (
              <QuarantineCard
                key={item.id}
                item={item}
                fields={fields}
                busy={busy}
                onDismiss={() => onDismiss(item)}
                onRestore={(fieldId, documentKind, value) => onRestore(item, fieldId, documentKind, value)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" /> Nenhum item pendente
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
