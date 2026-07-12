'use client'

import { useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  FileText,
  History,
  Loader2,
  Mic,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Stethoscope,
  PenLine,
  X,
} from 'lucide-react'
import { api } from '@/services/api'
import {
  AiWorkflowStatus,
  ClinicalSuggestion,
  ClinicalTemplateId,
  Consultation,
  ConsultationReadinessItem,
  ConversationTopic,
  FieldProvenance,
  TabId,
  TabStatus,
} from '@/types'
import { RecordingState } from '@/hooks/useRealtimeTranscription'
import { calcAge, cn } from '../shared/utils'

function hasContent(value: unknown) {
  if (value == null) return false
  if (typeof value === 'number') return true
  if (typeof value !== 'string') return true
  const normalized = value.trim()
  return normalized !== '' && normalized !== '{}' && normalized !== '[]' && normalized !== 'null'
}

function buildReadinessItems(consultation: Consultation): ConsultationReadinessItem[] {
  return [
    {
      id: 'queixa',
      label: 'Queixa e HDA',
      tabId: 'anamnese',
      complete: hasContent(consultation.chiefComplaint) && hasContent(consultation.hda),
      detail: 'Base narrativa para o Subjetivo',
    },
    {
      id: 'riscos',
      label: 'Riscos e antecedentes',
      tabId: 'antecedentes',
      complete:
        hasContent(consultation.previousDiseases) ||
        hasContent(consultation.allergiesDetails) ||
        hasContent(consultation.currentMedications),
      detail: 'Alergias, doenças e medicações',
    },
    {
      id: 'exame',
      label: 'Dados objetivos',
      tabId: 'exame_fisico',
      complete:
        hasContent(consultation.vitalSigns) ||
        hasContent(consultation.physicalExam) ||
        hasContent(consultation.generalState),
      detail: 'Sinais vitais e exame físico',
    },
    {
      id: 'diagnostico',
      label: 'Hipótese diagnóstica',
      tabId: 'diagnostico',
      complete:
        hasContent(consultation.mainHypothesis) ||
        hasContent(consultation.confirmedDiagnosis) ||
        hasContent(consultation.cid),
      detail: 'Raciocínio clínico para a Avaliação',
    },
    {
      id: 'conduta',
      label: 'Conduta',
      tabId: 'conduta',
      complete:
        hasContent(consultation.therapeuticPlan) ||
        hasContent(consultation.orientations) ||
        hasContent(consultation.referrals),
      detail: 'Plano terapêutico e orientações',
    },
  ]
}

function workflowStatus(
  recordingState: RecordingState,
  isInterpreting: boolean,
  isGeneratingSoap: boolean,
  hasError: boolean
): AiWorkflowStatus {
  if (hasError) return 'error'
  if (isGeneratingSoap) return 'generating_soap'
  if (isInterpreting) return 'interpreting'
  if (recordingState === 'recording') return 'recording'
  if (recordingState === 'processing') return 'processing'
  return 'idle'
}

function statusLabel(status: AiWorkflowStatus) {
  const map: Record<AiWorkflowStatus, { label: string; detail: string; cls: string }> = {
    idle: {
      label: 'Pronta',
      detail: 'Aguardando gravação ou revisão.',
      cls: 'bg-slate-100 text-slate-700',
    },
    recording: {
      label: 'Gravando',
      detail: 'Transcrição em tempo real ativa.',
      cls: 'bg-red-50 text-red-700',
    },
    processing: {
      label: 'Processando',
      detail: 'Salvando áudio e transcrição.',
      cls: 'bg-amber-50 text-amber-700',
    },
    interpreting: {
      label: 'Preenchendo PEP',
      detail: 'Reinterpretando a conversa completa.',
      cls: 'bg-primary-50 text-primary-700',
    },
    generating_soap: {
      label: 'Gerando SOAP',
      detail: 'Revisão final em andamento.',
      cls: 'bg-blue-50 text-blue-700',
    },
    error: {
      label: 'Atenção',
      detail: 'Revise o último erro antes de continuar.',
      cls: 'bg-red-50 text-red-700',
    },
  }

  return map[status]
}

function buildSoapText(consultation: Consultation) {
  return [
    ['S', consultation.subjective],
    ['O', consultation.objective],
    ['A', consultation.assessment],
    ['P', consultation.plan],
  ]
    .map(([letter, value]) => `${letter}: ${value || ''}`)
    .join('\n\n')
}

function buildPatientSummaryText(summary?: {
  overview: string
  activeProblems: string[]
  medications: string[]
  allergies: string[]
  recommendations: string
}) {
  if (!summary) return ''
  return [
    summary.overview,
    summary.activeProblems?.length ? `Problemas ativos: ${summary.activeProblems.join(', ')}` : '',
    summary.medications?.length ? `Medicações: ${summary.medications.join(', ')}` : '',
    summary.allergies?.length ? `Alergias: ${summary.allergies.join(', ')}` : '',
    summary.recommendations ? `Pontos de atenção: ${summary.recommendations}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

const TEMPLATE_LABELS: Record<ClinicalTemplateId, string> = {
  clinica_geral: 'Clinica geral',
  pediatria: 'Pediatria',
  ginecologia_obstetricia: 'Ginecologia e obstetricia',
  psiquiatria: 'Psiquiatria',
  cardiologia: 'Cardiologia',
}

function fieldLabel(field?: string) {
  const labels: Record<string, string> = {
    chiefComplaint: 'Queixa principal',
    hda: 'Historia da doenca atual',
    allergiesDetails: 'Alergias',
    currentMedications: 'Medicacoes',
    vitalSigns: 'Sinais vitais',
    physicalExam: 'Exame fisico',
    mainHypothesis: 'Hipotese diagnostica',
    differentials: 'Diagnósticos diferenciais',
    cid: 'Possíveis códigos CID',
    therapeuticPlan: 'Conduta',
    referrals: 'Encaminhamentos',
  }
  return labels[field || ''] || field || 'Prontuario'
}

function formatSuggestionValue(value?: string) {
  if (!value) return ''
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            const entry = item as Record<string, unknown>
            return [entry.code, entry.description].filter(Boolean).join(' - ') || JSON.stringify(item)
          }
          return String(item)
        })
        .join('; ')
    }
    if (typeof parsed === 'string') return parsed
    return JSON.stringify(parsed)
  } catch {
    return value
  }
}

function PanelTitle({ label, title, icon: Icon }: { label: string; title: string; icon?: typeof FileText }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <h3 className="mt-1 text-sm font-semibold text-slate-950">{title}</h3>
      </div>
      {Icon ? <Icon className="h-4 w-4 text-slate-400" /> : null}
    </div>
  )
}

export function MedicalToolsPanel({
  consultation,
  tabStatuses,
  recordingState,
  isInterpreting,
  isGeneratingSoap,
  lastError,
  templateId,
  suggestions,
  fieldMeta,
  onSelectTab,
  onReinterpret,
  onTemplateChange,
  onAcceptSuggestion,
  onEditSuggestion,
  onDismissSuggestion,
  onOpenConversation,
  onGenerateSoap,
  onCopyText,
  onPrintSoap,
  className,
}: {
  consultation: Consultation
  tabStatuses: Record<TabId, TabStatus>
  recordingState: RecordingState
  isInterpreting: boolean
  isGeneratingSoap: boolean
  lastError: string | null
  templateId: ClinicalTemplateId
  suggestions: ClinicalSuggestion[]
  fieldMeta: Record<string, FieldProvenance>
  onSelectTab: (tab: TabId) => void
  onReinterpret: () => void
  onTemplateChange: (templateId: ClinicalTemplateId) => void
  onAcceptSuggestion: (suggestion: ClinicalSuggestion) => void
  onEditSuggestion: (suggestion: ClinicalSuggestion) => void
  onDismissSuggestion: (suggestion: ClinicalSuggestion) => void
  onOpenConversation: () => void
  onGenerateSoap: () => void
  onCopyText: (label: string, text: string) => void
  onPrintSoap: () => void
  className?: string
}) {
  const patient = consultation.patient
  const readiness = useMemo(() => buildReadinessItems(consultation), [consultation])
  const completedItems = readiness.filter((item) => item.complete).length
  const tabsUnderReview = Object.values(tabStatuses).filter((status) => status === 'incomplete').length
  const soapText = useMemo(() => buildSoapText(consultation), [consultation])
  const hasSoap = Boolean(
    consultation.subjective || consultation.objective || consultation.assessment || consultation.plan
  )
  const status = statusLabel(
    workflowStatus(recordingState, isInterpreting, isGeneratingSoap, Boolean(lastError))
  )
  const openSuggestions = suggestions.filter((suggestion) => suggestion.status === 'open')
  const reviewFields = Object.values(fieldMeta).filter(
    (item) => item.requiresReview && item.status !== 'accepted' && item.status !== 'dismissed'
  ).length

  const summaryMutation = useMutation({
    mutationFn: () => api.patients.summary(consultation.patientId),
  })

  const topicsQuery = useQuery({
    queryKey: ['topics', consultation.id, 'panel'],
    queryFn: () => api.consultations.topics(consultation.id),
    enabled: false,
  })

  const topics: ConversationTopic[] = topicsQuery.data?.topics || []
  const summaryText = buildPatientSummaryText(summaryMutation.data?.summary || undefined)

  return (
    <aside className={cn('flex w-full flex-col bg-white', className)}>
      <section className="border-b border-slate-200 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Ferramentas médicas</p>
            <h2 className="mt-1 truncate text-sm font-semibold text-slate-950">{patient?.name || 'Paciente'}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {[patient?.birthDate ? calcAge(patient.birthDate) : null, patient?.sex].filter(Boolean).join(' - ') ||
                'Dados clínicos em revisão'}
            </p>
          </div>
        </div>

        {(patient?.allergies || patient?.chronicDiseases) && (
          <div className="mt-4 grid gap-2">
            {patient.allergies ? (
              <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Alergias
                </p>
                <p className="mt-1 text-xs leading-relaxed text-red-700">{patient.allergies}</p>
              </div>
            ) : null}
            {patient.chronicDiseases ? (
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold text-amber-700">Doenças crônicas</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700">{patient.chronicDiseases}</p>
              </div>
            ) : null}
          </div>
        )}

        <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Contexto clinico
          <select
            value={templateId}
            onChange={(event) => onTemplateChange(event.target.value as ClinicalTemplateId)}
            className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 outline-none focus:border-primary-400"
          >
            {Object.entries(TEMPLATE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="border-b border-slate-200 p-4">
        <PanelTitle label="Status da IA" title={status.label} />
        <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', status.cls)}>
          {recordingState === 'recording' ? <Mic className="mr-1 h-3 w-3" /> : null}
          {status.label}
        </span>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{lastError || status.detail}</p>
        {tabsUnderReview > 0 ? (
          <p className="mt-2 text-xs text-amber-600">{tabsUnderReview} aba(s) pedem revisão.</p>
        ) : null}
        <button
          type="button"
          onClick={onReinterpret}
          disabled={isInterpreting || isGeneratingSoap || !consultation.transcript}
          className="btn-secondary mt-3 w-full justify-center text-xs"
        >
          {isInterpreting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Interpretar conversa agora
        </button>
      </section>

      <section className="border-b border-slate-200 p-4">
        <PanelTitle
          label="Revisao clinica"
          title={openSuggestions.length ? `${openSuggestions.length} item(ns) para revisar` : 'Sem pendencias novas'}
          icon={AlertTriangle}
        />
        {reviewFields > 0 ? (
          <p className="mb-2 text-xs text-amber-700">{reviewFields} campo(s) preenchidos pela IA aguardam confirmação.</p>
        ) : null}
        {openSuggestions.length ? (
          <div className="space-y-2">
            {openSuggestions.slice(0, 4).map((suggestion) => (
              <div key={suggestion.id} className="rounded-md border border-amber-100 bg-amber-50/60 p-3">
                <p className="text-xs font-semibold text-amber-900">{suggestion.title || fieldLabel(suggestion.field)}</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">{suggestion.message}</p>
                {suggestion.proposedValue ? (
                  <p className="mt-2 rounded border border-amber-200 bg-white/80 px-2 py-1.5 text-xs font-medium text-slate-700">
                    {fieldLabel(suggestion.field)}: {formatSuggestionValue(suggestion.proposedValue)}
                  </p>
                ) : null}
                {suggestion.evidence[0]?.quote ? (
                  <button type="button" onClick={onOpenConversation} className="mt-2 block w-full border-l-2 border-amber-300 pl-2 text-left text-xs italic leading-relaxed text-slate-600 hover:text-slate-900" title="Abrir evidência na conversa">
                    &quot;{suggestion.evidence[0].quote}&quot;
                  </button>
                ) : null}
                <div className="mt-2 flex gap-2">
                  {suggestion.field && suggestion.proposedValue ? (
                    <button
                      type="button"
                      onClick={() => onAcceptSuggestion(suggestion)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Aplicar
                    </button>
                  ) : null}
                  {suggestion.field && suggestion.proposedValue ? (
                    <button type="button" onClick={() => onEditSuggestion(suggestion)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800">
                      <PenLine className="h-3.5 w-3.5" />
                      Editar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onDismissSuggestion(suggestion)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                    Descartar
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-slate-500">A IA nao encontrou conflitos ou perguntas pendentes nos segmentos processados.</p>
        )}
      </section>

      <section className="border-b border-slate-200 p-4">
        <PanelTitle label="Prontidão SOAP" title={`${completedItems}/${readiness.length} itens revisados`} icon={FileText} />
        <div className="space-y-1.5">
          {readiness.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.tabId)}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50"
            >
              {item.complete ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              )}
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-slate-800">{item.label}</span>
                <span className="block text-xs leading-tight text-slate-500">{item.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="border-b border-slate-200 p-4">
        <PanelTitle label="Resumo longitudinal" title="Resumo IA do paciente" icon={Sparkles} />
        {summaryMutation.data?.summary ? (
          <div className="space-y-2">
            <p className="text-xs leading-relaxed text-slate-600">{summaryMutation.data.summary.overview}</p>
            {summaryMutation.data.summary.recommendations ? (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {summaryMutation.data.summary.recommendations}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => onCopyText('Resumo do paciente', summaryText)}
              className="btn-secondary w-full justify-center text-xs"
            >
              <Clipboard className="h-4 w-4" />
              Copiar resumo
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => summaryMutation.mutate()}
            disabled={summaryMutation.isPending}
            className="btn-secondary w-full justify-center text-xs"
          >
            {summaryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {summaryMutation.isPending ? 'Analisando histórico...' : 'Gerar resumo IA'}
          </button>
        )}
        {summaryMutation.isError ? <p className="mt-2 text-xs text-red-600">{summaryMutation.error.message}</p> : null}
      </section>

      <section className="border-b border-slate-200 p-4">
        <PanelTitle label="Evidências" title="Conversa e tópicos" icon={Search} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onOpenConversation} className="btn-secondary justify-center text-xs">
            <History className="h-4 w-4" />
            Revisar
          </button>
          <button
            type="button"
            onClick={() => void topicsQuery.refetch()}
            disabled={topicsQuery.isFetching || !consultation.transcript}
            className="btn-secondary justify-center text-xs"
          >
            {topicsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Tópicos
          </button>
        </div>
        {topics.length ? (
          <div className="mt-3 space-y-2">
            {topics.slice(0, 3).map((topic, index) => (
              <div key={`${topic.title}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-slate-800">{topic.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{topic.summary}</p>
              </div>
            ))}
          </div>
        ) : topicsQuery.isError ? (
          <p className="mt-2 text-xs text-red-600">{topicsQuery.error.message}</p>
        ) : null}
      </section>

      <section className="p-4">
        <PanelTitle label="Evolução" title="Ações SOAP" icon={FileText} />
        <div className="space-y-2">
          <button
            type="button"
            onClick={onGenerateSoap}
            disabled={isGeneratingSoap || recordingState !== 'idle'}
            className="btn-primary w-full justify-center text-xs"
          >
            {isGeneratingSoap ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {isGeneratingSoap ? 'Gerando SOAP...' : 'Gerar SOAP'}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onCopyText('SOAP', soapText)}
              disabled={!hasSoap}
              className="btn-secondary justify-center text-xs"
            >
              <Clipboard className="h-4 w-4" />
              Copiar
            </button>
            <button
              type="button"
              onClick={onPrintSoap}
              disabled={!hasSoap}
              className="btn-secondary justify-center text-xs"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
          </div>
        </div>
      </section>
    </aside>
  )
}
