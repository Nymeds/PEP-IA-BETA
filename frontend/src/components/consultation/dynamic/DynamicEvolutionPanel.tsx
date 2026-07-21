'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileCheck2, FilePenLine, FileText, Loader2, ShieldAlert, Sparkles } from 'lucide-react'
import type {
  ClinicalDocumentFormat,
  ClinicalDocumentKind,
  DynamicConsultationRuntime,
  DynamicGeneratedContent,
  DynamicGeneratedDocument,
} from '@/types/forms'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/shared/utils'

const FORMAT_INFO: Record<ClinicalDocumentFormat, { title: string; description: string }> = {
  SOAP: {
    title: 'SOAP',
    description: 'Subjetivo, Objetivo, Avaliação e Plano.',
  },
  DAP: {
    title: 'DAP',
    description: 'Dados, Avaliação e Plano.',
  },
  BIRP: {
    title: 'BIRP',
    description: 'Comportamento, Intervenção, Resposta e Plano.',
  },
}

const FORMAT_SECTIONS: Record<ClinicalDocumentFormat, Array<{ key: string; title: string }>> = {
  SOAP: [
    { key: 'subjetivo', title: 'Subjetivo' },
    { key: 'objetivo', title: 'Objetivo' },
    { key: 'avaliacao', title: 'Avaliação' },
    { key: 'plano', title: 'Plano' },
  ],
  DAP: [
    { key: 'dados', title: 'Dados' },
    { key: 'avaliacao', title: 'Avaliação' },
    { key: 'plano', title: 'Plano' },
  ],
  BIRP: [
    { key: 'comportamento', title: 'Comportamento' },
    { key: 'intervencao', title: 'Intervenção' },
    { key: 'resposta', title: 'Resposta' },
    { key: 'plano', title: 'Plano' },
  ],
}

function emptyManualContent(
  format: ClinicalDocumentFormat,
  documentKind: ClinicalDocumentKind
): DynamicGeneratedContent {
  return {
    format,
    documentKind,
    sections: FORMAT_SECTIONS[format].map((section) => ({
      ...section,
      content: '',
      evidenceSegmentIds: [],
    })),
    warnings: ['Documento preenchido manualmente pelo profissional.'],
    requiresProfessionalReview: true,
  }
}

function parseContent(contentJson?: string): DynamicGeneratedContent | null {
  if (!contentJson) return null
  try {
    return JSON.parse(contentJson) as DynamicGeneratedContent
  } catch {
    return null
  }
}

export function DynamicEvolutionPanel({
  runtime,
  busy,
  canGenerate,
  canCreateManual,
  onGenerate,
  onCreateManual,
  onConfirm,
}: {
  runtime: DynamicConsultationRuntime
  busy?: boolean
  canGenerate: boolean
  canCreateManual: boolean
  onGenerate: (format: ClinicalDocumentFormat, kind: ClinicalDocumentKind) => void
  onCreateManual: (content: DynamicGeneratedContent) => void
  onConfirm: (
    document: DynamicGeneratedDocument,
    content: DynamicGeneratedContent,
    reason?: string
  ) => void
}) {
  const [format, setFormat] = useState<ClinicalDocumentFormat>(runtime.template.defaultDocumentFormat)
  const [kind, setKind] = useState<ClinicalDocumentKind>('compartilhavel')
  const latest = useMemo(
    () => runtime.generatedDocuments.find(
      (document) => document.format === format && document.documentKind === kind
    ),
    [format, kind, runtime.generatedDocuments]
  )
  const parsed = useMemo(
    () => parseContent(latest?.contentJson),
    [latest?.contentJson]
  )
  const [content, setContent] = useState<DynamicGeneratedContent | null>(parsed)
  const [manualDraft, setManualDraft] = useState<DynamicGeneratedContent | null>(null)
  const [amendmentMode, setAmendmentMode] = useState(false)
  const [amendmentReason, setAmendmentReason] = useState('')
  const pendingReview = runtime.quarantine.filter((item) => item.status === 'pendente').length
  const semanticRoles = useMemo(
    () => Array.from(new Set(
      runtime.definition.documents
        .find((document) => document.kind === kind)
        ?.tabs.flatMap((tab) => tab.elements.map((field) => field.semanticRole).filter(Boolean)) || []
    )),
    [kind, runtime.definition.documents]
  )

  useEffect(() => {
    setContent(parsed)
    if (parsed) setManualDraft(null)
    setAmendmentMode(false)
    setAmendmentReason('')
  }, [latest?.id, parsed])

  useEffect(() => setManualDraft(null), [format, kind])

  const updateSection = (key: string, value: string) => {
    const current = latest ? content : manualDraft
    if (!current) return
    const next = {
      ...current,
      sections: current.sections.map((section) => section.key === key ? { ...section, content: value } : section),
    }
    if (latest) setContent(next)
    else setManualDraft(next)
  }

  return (
    <div className="space-y-4 p-4">
      <section>
        <div className="mb-2 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary-600" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Estrutura da evolução</h3>
        </div>
        <div className="grid gap-2">
          {(Object.keys(FORMAT_INFO) as ClinicalDocumentFormat[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFormat(item)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                format === item
                  ? 'border-primary-300 bg-primary-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              )}
              aria-pressed={format === item}
            >
              <p className="text-xs font-semibold text-slate-900">{FORMAT_INFO[item].title}</p>
              <p className="mt-1 text-[11px] text-slate-500">{FORMAT_INFO[item].description}</p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Documento de destino</p>
        <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setKind('compartilhavel')}
            className={cn('rounded-md px-2 py-2 text-xs font-medium', kind === 'compartilhavel' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500')}
          >
            Prontuário
          </button>
          <button
            type="button"
            onClick={() => setKind('restrito')}
            className={cn('rounded-md px-2 py-2 text-xs font-medium', kind === 'restrito' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500')}
          >
            Restrito
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {kind === 'compartilhavel'
            ? 'Usa somente campos do prontuário compartilhável.'
            : 'Permanece separado e acessível apenas ao profissional.'}
        </p>
        {semanticRoles.length ? (
          <p className="mt-2 text-[10px] text-slate-500">
            Papéis documentais disponíveis: {semanticRoles.join(', ')}.
          </p>
        ) : null}
      </section>

      {!canGenerate ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3" role="alert">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
            <ShieldAlert className="h-3.5 w-3.5" /> Evolução ainda bloqueada
          </p>
          <p className="mt-1 text-[11px] text-amber-800">
            Para usar a IA, encerre a gravação e confirme a identidade e autorização das vozes.
            O preenchimento manual continua disponível.
          </p>
        </div>
      ) : null}

      <Button
        variant="primary"
        className="w-full justify-center"
        disabled={busy || !canGenerate}
        onClick={() => onGenerate(format, kind)}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? 'Gerando evolução...' : `Gerar ${format}`}
      </Button>

      <Button
        className="w-full justify-center"
        disabled={busy || !canCreateManual || Boolean(latest)}
        onClick={() => setManualDraft(emptyManualContent(format, kind))}
      >
        <FilePenLine className="h-4 w-4" />
        {manualDraft ? 'Reiniciar rascunho manual' : `Preencher ${format} manualmente`}
      </Button>

      {!latest && manualDraft ? (
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div>
            <p className="text-xs font-semibold text-slate-900">
              {manualDraft.format} manual · {kind === 'restrito' ? 'Restrito' : 'Prontuário'}
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
              Preencha todas as seções. O conteúdo ainda passará por confirmação profissional.
            </p>
          </div>
          <div className="mt-3 space-y-3">
            {manualDraft.sections.map((section) => (
              <label key={section.key} className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-700">{section.title}</span>
                <textarea
                  value={section.content}
                  onChange={(event) => updateSection(section.key, event.target.value)}
                  className="form-input min-h-24 text-xs leading-relaxed"
                />
              </label>
            ))}
          </div>
          <Button
            variant="primary"
            className="mt-3 w-full justify-center"
            disabled={busy || manualDraft.sections.some((section) => !section.content.trim())}
            onClick={() => onCreateManual(manualDraft)}
          >
            <FileCheck2 className="h-4 w-4" /> Salvar rascunho manual
          </Button>
        </section>
      ) : null}

      {latest && content ? (
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-900">{latest.format} · {latest.documentKind === 'restrito' ? 'Restrito' : 'Prontuário'}</p>
              <p className="mt-1 text-[10px] text-slate-500">
                {latest.status === 'confirmado' ? 'Confirmado pelo profissional' : 'Rascunho aguardando revisão profissional'}
              </p>
            </div>
            <span className={cn(
              'rounded-full px-2 py-1 text-[10px] font-semibold',
              latest.status === 'confirmado'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-blue-50 text-blue-700'
            )}>
              {latest.status === 'confirmado' ? 'Confirmado' : 'Revisar'}
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {content.sections.map((section) => (
              <label key={section.key} className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-700">{section.title}</span>
                <textarea
                  value={section.content}
                  onChange={(event) => updateSection(section.key, event.target.value)}
                  disabled={latest.status === 'confirmado' && !amendmentMode}
                  className="form-input min-h-24 text-xs leading-relaxed"
                />
                {section.evidenceSegmentIds.length ? (
                  <span className="mt-1 block text-[10px] text-slate-400">
                    Evidências: {section.evidenceSegmentIds.join(', ')}
                  </span>
                ) : null}
              </label>
            ))}
          </div>

          {content.warnings.length ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2">
              {content.warnings.map((warning) => <p key={warning} className="text-[11px] text-amber-800">• {warning}</p>)}
            </div>
          ) : null}

          {latest.status !== 'confirmado' ? (
            <div className="mt-3">
              {pendingReview ? (
                <p className="mb-2 text-[11px] text-amber-700">
                  Resolva ou descarte {pendingReview} item(ns) da central de revisão antes de confirmar.
                </p>
              ) : null}
              <Button
                variant="primary"
                className="w-full justify-center"
                disabled={busy || pendingReview > 0 || content.sections.some((section) => !section.content.trim())}
                onClick={() => onConfirm(latest, content)}
              >
                <FileCheck2 className="h-4 w-4" /> Confirmar revisão profissional
              </Button>
            </div>
          ) : amendmentMode ? (
            <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
              <label className="block text-[11px] font-semibold text-violet-900">
                Motivo obrigatório do adendo
                <input
                  value={amendmentReason}
                  onChange={(event) => setAmendmentReason(event.target.value)}
                  maxLength={2000}
                  className="form-input mt-1 text-xs"
                  placeholder="Explique por que o documento confirmado precisa ser corrigido"
                />
              </label>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => {
                  setContent(parsed)
                  setAmendmentMode(false)
                  setAmendmentReason('')
                }}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || amendmentReason.trim().length < 5 || content.sections.some((section) => !section.content.trim())}
                  onClick={() => onConfirm(latest, content, amendmentReason.trim())}
                >
                  <FileCheck2 className="h-4 w-4" /> Salvar adendo
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Revisão confirmada
              </p>
              <Button size="sm" onClick={() => setAmendmentMode(true)}>
                <FilePenLine className="h-3.5 w-3.5" /> Criar adendo
              </Button>
            </div>
          )}
        </section>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-[11px] text-slate-500">
          Nenhuma evolução {format} gerada para este documento.
        </div>
      )}
    </div>
  )
}
