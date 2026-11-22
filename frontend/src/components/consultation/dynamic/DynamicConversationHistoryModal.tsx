'use client'

import {
  FileClock,
  History,
  ListTree,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/shared/utils'
import { dynamicConsultationApi } from '@/services/dynamic-consultation-api'
import type {
  DynamicConsultationRuntime,
  DynamicTranscriptVersionCreateResult,
} from '@/types/forms'
import {
  dynamicVoiceGroupKey,
  getDynamicTurnAiUsage,
  getDynamicAiVoiceReadiness,
  safeSpeakerDisplayName,
} from './dynamic-voice-readiness'

type HistoryTab = 'transcricao' | 'topicos' | 'versoes'

interface Props {
  runtime: DynamicConsultationRuntime
  consultationStatus: string
  onClose: () => void
  onBeforeVersionCreate: () => Promise<void>
  onVersionCreated: (
    result: DynamicTranscriptVersionCreateResult
  ) => Promise<void> | void
}

const TABS: Array<{ id: HistoryTab; label: string; icon: LucideIcon }> = [
  { id: 'transcricao', label: 'Transcrição', icon: Search },
  { id: 'topicos', label: 'Tópicos', icon: ListTree },
  { id: 'versoes', label: 'Versões', icon: FileClock },
]

function escapedSearchTerm(term: string) {
  return term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function countTranscriptOccurrences(text: string, term: string) {
  const safeTerm = escapedSearchTerm(term)
  if (!safeTerm) return 0
  return text.match(new RegExp(safeTerm, 'gi'))?.length || 0
}

export function highlightTranscript(text: string, term: string) {
  const normalizedTerm = term.trim()
  const safeTerm = escapedSearchTerm(term)
  if (!safeTerm) return text

  return text.split(new RegExp(`(${safeTerm})`, 'gi')).map((part, index) =>
    part.toLocaleLowerCase('pt-BR') === normalizedTerm.toLocaleLowerCase('pt-BR') ? (
      <mark key={index} className="rounded bg-amber-200 px-0.5 text-slate-950">
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    )
  )
}

function isFinishedStatus(status: string) {
  return status === 'finalizado' || status === 'completed'
}

function timeLabel(seconds?: number) {
  if (seconds == null) return ''
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

const TURN_USAGE_STYLE = {
  uso_clinico: {
    label: 'Uso clínico',
    badge: 'bg-emerald-50 text-emerald-700',
    card: 'border-slate-200 bg-white',
  },
  citacao_atribuida: {
    label: 'Citação atribuída',
    badge: 'bg-blue-100 text-blue-800',
    card: 'border-blue-200 bg-blue-50/60',
  },
  revisao_obrigatoria: {
    label: 'Revisão obrigatória',
    badge: 'bg-amber-100 text-amber-900',
    card: 'border-amber-200 bg-amber-50',
  },
  ignorado: {
    label: 'Ignorada',
    badge: 'bg-slate-200 text-slate-700',
    card: 'border-slate-200 bg-slate-50',
  },
} as const

export function DynamicConversationHistoryModal({
  runtime,
  consultationStatus,
  onClose,
  onBeforeVersionCreate,
  onVersionCreated,
}: Props) {
  const initialTranscript = runtime.conversation.transcript || ''
  const [tab, setTab] = useState<HistoryTab>('transcricao')
  const [search, setSearch] = useState('')
  const [editText, setEditText] = useState(initialTranscript)
  const [savedTranscript, setSavedTranscript] = useState(initialTranscript)
  const [editReason, setEditReason] = useState('')
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const voiceReadiness = getDynamicAiVoiceReadiness(
    runtime.conversation.turns,
    runtime.participants
  )
  const voicesByKey = new Map(
    voiceReadiness.voices.map((voice) => [voice.key, voice])
  )

  useEffect(() => {
    closeButtonRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    if (editText === savedTranscript) setEditText(initialTranscript)
    setSavedTranscript(initialTranscript)
  }, [editText, initialTranscript, savedTranscript])

  const topicsQuery = useQuery({
    queryKey: ['dynamic-conversation-topics', runtime.consultationId],
    queryFn: () => dynamicConsultationApi.topics(runtime.consultationId),
    enabled: tab === 'topicos',
  })

  const versionsQuery = useQuery({
    queryKey: ['dynamic-transcript-versions', runtime.consultationId],
    queryFn: () => dynamicConsultationApi.transcriptVersions(runtime.consultationId),
    enabled: tab === 'versoes',
  })

  const createVersion = useMutation({
    mutationFn: async () => {
      await onBeforeVersionCreate()
      return dynamicConsultationApi.createTranscriptVersion(
        runtime.consultationId,
        {
          newTranscript: editText.trim(),
          reason: editReason.trim() || 'Correção profissional da transcrição',
          editDiff: {
            before: savedTranscript,
            after: editText.trim(),
          },
        }
      )
    },
    onSuccess: async (result) => {
      await onVersionCreated(result)
      const transcript = result.runtime.conversation.transcript || editText.trim()
      setSavedTranscript(transcript)
      setEditText(transcript)
      setEditReason('')
      await versionsQuery.refetch()
    },
  })

  const transcript = runtime.conversation.transcript || savedTranscript
  const occurrences = countTranscriptOccurrences(transcript, search)
  const transcriptChanged = editText.trim() !== savedTranscript.trim()
  const reasonRequired = isFinishedStatus(consultationStatus)
  const canSaveVersion = Boolean(
    editText.trim() &&
    transcriptChanged &&
    (!reasonRequired || editReason.trim())
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-2 backdrop-blur-[1px] sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="flex h-[min(88vh,860px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dynamic-conversation-history-title"
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <History className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="dynamic-conversation-history-title"
                className="truncate text-sm font-semibold text-slate-950"
              >
                Histórico da conversa
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Consulte a transcrição, os tópicos e as correções preservadas.
              </p>
            </div>
          </div>
          <Button
            ref={closeButtonRef}
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="Fechar histórico da conversa"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>

        <nav
          className="flex shrink-0 overflow-x-auto border-b border-slate-200 px-2 sm:px-4"
          role="tablist"
          aria-label="Conteúdo do histórico"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-semibold transition-colors sm:px-4',
                tab === id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === 'transcricao' ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-slate-100 p-3 sm:p-4">
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-primary-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary-100">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="sr-only">Buscar na conversa</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar e destacar na conversa"
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:ring-0"
                  />
                  {search.trim() ? (
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                      {occurrences} {occurrences === 1 ? 'resultado' : 'resultados'}
                    </span>
                  ) : null}
                </label>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                {runtime.conversation.turns.length ? (
                  <div className="mx-auto max-w-3xl space-y-2">
                    {runtime.conversation.turns.map((turn, index) => {
                      const voice = voicesByKey.get(dynamicVoiceGroupKey(turn, index))
                      const professional = voice?.role === 'profissional'
                      const usage = voice
                        ? getDynamicTurnAiUsage(turn, voice)
                        : 'ignorado'
                      const usageStyle = TURN_USAGE_STYLE[usage]
                      const usageLabel = usage === 'ignorado' && turn.participantAuthorized === false
                        ? 'Excluída'
                        : usageStyle.label

                      return (
                        <article
                          key={`${turn.diarizationLabel || turn.speaker}-${index}`}
                          className={cn(
                            'rounded-xl border p-3.5 shadow-sm',
                            usage === 'uso_clinico' && professional
                                ? 'border-primary-100 bg-primary-50/50'
                                : usageStyle.card
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            {professional ? (
                              <UserRound className="h-3.5 w-3.5 text-primary-600" aria-hidden="true" />
                            ) : (
                              <UsersRound className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                            )}
                            <span className="text-xs font-semibold text-slate-800">
                              {voice?.displayName || safeSpeakerDisplayName(turn.speakerDisplayName)}
                            </span>
                            <span className={cn(
                              'rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                              usageStyle.badge
                            )}>
                              {usageLabel}
                            </span>
                            {usage === 'citacao_atribuida' ? (
                              <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-semibold text-blue-800 ring-1 ring-blue-200">
                                Não preenche o PEP
                              </span>
                            ) : null}
                            {turn.start != null ? (
                              <span className="ml-auto text-[10px] tabular-nums text-slate-400">
                                {timeLabel(turn.start)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {highlightTranscript(turn.text, search)}
                          </p>
                          {usage === 'citacao_atribuida' ? (
                            <p className="mt-2 text-[11px] leading-5 text-blue-800">
                              A relação reconhecida pode ser citada ou sustentar uma sugestão
                              revisada, sem preencher campos automaticamente.
                            </p>
                          ) : usage === 'revisao_obrigatoria' ? (
                            <p className="mt-2 text-[11px] leading-5 text-amber-800">
                              Voz ambígua: pode originar uma sugestão, mas exige confirmação
                              profissional e não preenche o PEP automaticamente.
                            </p>
                          ) : usage === 'ignorado' ? (
                            <p className="mt-2 text-[11px] leading-5 text-slate-500">
                              Este trecho não é usado no PEP nem na evolução.
                            </p>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                ) : transcript ? (
                  <article className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                      {highlightTranscript(transcript, search)}
                    </p>
                  </article>
                ) : (
                  <div className="flex h-full min-h-48 items-center justify-center">
                    <p className="text-sm text-slate-400">
                      Nenhuma fala foi transcrita nesta consulta.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {tab === 'topicos' ? (
            <div className="h-full overflow-y-auto p-4 sm:p-5">
              <div className="mx-auto max-w-3xl">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Tópicos da conversa
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Resumo dos assuntos clínicos mencionados no atendimento.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void topicsQuery.refetch()}
                    disabled={topicsQuery.isFetching || !transcript.trim()}
                  >
                    <RefreshCw
                      className={cn('h-3.5 w-3.5', topicsQuery.isFetching && 'animate-spin')}
                      aria-hidden="true"
                    />
                    Atualizar
                  </Button>
                </div>

                {topicsQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Organizando tópicos
                  </div>
                ) : topicsQuery.isError ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {topicsQuery.error.message}
                  </p>
                ) : topicsQuery.data?.topics.length ? (
                  <div className="space-y-3">
                    {topicsQuery.data.topics.map((topic, index) => (
                      <article
                        key={`${topic.title}-${index}`}
                        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start gap-2">
                          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-slate-900">
                              {topic.title}
                            </h4>
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                              {topic.summary}
                            </p>
                          </div>
                        </div>
                        {topic.evidence.length ? (
                          <div className="mt-3 space-y-1.5">
                            {topic.evidence.slice(0, 3).map((evidence) => (
                              <blockquote
                                key={`${evidence.segmentId}-${evidence.sequence}`}
                                className="border-l-2 border-primary-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600"
                              >
                                “{evidence.quote}”
                              </blockquote>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    Nenhum tópico foi identificado ainda.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {tab === 'versoes' ? (
            <div className="h-full overflow-y-auto p-4 sm:p-5">
              <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Corrigir transcrição
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      A versão anterior será preservada e o preenchimento do PEP será
                      recalculado a partir da correção.
                    </p>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Transcrição
                    </span>
                    <textarea
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      rows={13}
                      className="form-textarea resize-y text-sm leading-6"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Motivo da correção {reasonRequired ? '*' : '(opcional)'}
                    </span>
                    <input
                      value={editReason}
                      onChange={(event) => setEditReason(event.target.value)}
                      placeholder="Ex.: corrigir trecho transcrito incorretamente"
                      className="form-input"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="primary"
                      onClick={() => createVersion.mutate()}
                      disabled={!canSaveVersion || createVersion.isPending}
                    >
                      {createVersion.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Save className="h-4 w-4" aria-hidden="true" />
                      )}
                      {createVersion.isPending ? 'Salvando e recalculando...' : 'Salvar correção'}
                    </Button>
                    {!transcriptChanged ? (
                      <span className="text-xs text-slate-400">Nenhuma alteração pendente.</span>
                    ) : null}
                  </div>

                  {createVersion.isError ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                      {createVersion.error.message}
                    </p>
                  ) : null}
                </div>

                <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Versões anteriores
                    </h3>
                    {versionsQuery.data ? (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                        {versionsQuery.data.length}
                      </span>
                    ) : null}
                  </div>

                  {versionsQuery.isLoading ? (
                    <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Carregando versões
                    </div>
                  ) : versionsQuery.isError ? (
                    <p className="text-xs leading-5 text-red-700">
                      {versionsQuery.error.message}
                    </p>
                  ) : versionsQuery.data?.length ? (
                    <div className="space-y-2">
                      {versionsQuery.data.map((version) => (
                        <details
                          key={version.id}
                          className="group rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <summary className="cursor-pointer list-none">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold text-slate-800">
                                  Versão {version.version}
                                </p>
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                  {new Date(version.createdAt).toLocaleString('pt-BR')}
                                </p>
                              </div>
                              <History className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                            </div>
                            {version.reason ? (
                              <p className="mt-2 text-[11px] leading-4 text-slate-600">
                                {version.reason}
                              </p>
                            ) : null}
                          </summary>
                          <p className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
                            {version.transcript || 'Sem transcrição preservada nesta versão.'}
                          </p>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs leading-5 text-slate-500">
                      Esta é a primeira versão da transcrição.
                    </p>
                  )}
                </aside>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
