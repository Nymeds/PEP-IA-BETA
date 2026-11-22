'use client'

import { MessageSquareText, RefreshCw, Sparkles, UserRound, UsersRound } from 'lucide-react'
import type { DynamicConsultationRuntime, DynamicConversationTopic } from '@/types/forms'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/shared/utils'
import {
  dynamicVoiceGroupKey,
  getDynamicTurnAiUsage,
  getDynamicAiVoiceReadiness,
  safeSpeakerDisplayName,
} from './dynamic-voice-readiness'

function timeLabel(seconds?: number) {
  if (seconds == null) return ''
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export function DynamicConversationPanel({
  runtime,
  topics,
  loadingTopics,
  onLoadTopics,
}: {
  runtime: DynamicConsultationRuntime
  topics: DynamicConversationTopic[]
  loadingTopics?: boolean
  onLoadTopics: () => void
}) {
  const voiceReadiness = getDynamicAiVoiceReadiness(
    runtime.conversation.turns,
    runtime.participants
  )
  const voicesByKey = new Map(
    voiceReadiness.voices.map((voice) => [voice.key, voice])
  )
  const voicesByLabel = new Map(
    voiceReadiness.voices.flatMap((voice) =>
      voice.diarizationLabel ? [[voice.diarizationLabel, voice] as const] : []
    )
  )

  return (
    <div className="space-y-4 p-4">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Tópicos clínicos</h3>
          </div>
          <Button size="sm" onClick={onLoadTopics} disabled={loadingTopics || !runtime.conversation.transcript?.trim()}>
            <RefreshCw className={cn('h-3.5 w-3.5', loadingTopics && 'animate-spin')} />
            {topics.length ? 'Atualizar' : 'Gerar'}
          </Button>
        </div>
        {topics.length ? (
          <div className="space-y-2">
            {topics.map((topic, index) => (
              <article key={`${topic.title}-${index}`} className="rounded-lg border border-primary-100 bg-primary-50/50 p-3">
                <p className="text-xs font-semibold text-primary-900">{topic.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-primary-800">{topic.summary}</p>
                <p className="mt-1 text-[10px] text-primary-600">{topic.evidence.length} evidência(s) validada(s)</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-500">
            Os tópicos preservam evidências literais e as regras de revisão das falas.
          </p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-cyan-600" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Conversa por voz</h3>
        </div>

        {runtime.conversation.turns.length ? (
          <div className="space-y-2">
            {runtime.conversation.turns.map((turn, index) => {
              const voice = voicesByKey.get(dynamicVoiceGroupKey(turn, index))
              const professional = voice?.role === 'profissional'
              const usage = voice ? getDynamicTurnAiUsage(turn, voice) : 'ignorado'
              const usageLabel = usage === 'uso_clinico'
                ? 'Uso clínico'
                : usage === 'citacao_atribuida'
                  ? 'Citação atribuída'
                  : usage === 'revisao_obrigatoria'
                    ? 'Revisão obrigatória'
                    : turn.participantAuthorized === false
                      ? 'Excluída'
                      : 'Ignorada'
              return (
                <article
                  key={`${turn.diarizationLabel || turn.speaker}-${index}`}
                  className={cn(
                    'rounded-lg border p-3',
                    usage === 'revisao_obrigatoria'
                      ? 'border-amber-200 bg-amber-50'
                      : usage === 'citacao_atribuida'
                        ? 'border-blue-200 bg-blue-50/60'
                        : usage === 'ignorado'
                          ? 'border-slate-200 bg-slate-50'
                          : professional
                            ? 'border-primary-100 bg-primary-50/40'
                            : 'border-slate-200 bg-white'
                  )}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {professional ? <UserRound className="h-3.5 w-3.5 text-primary-600" /> : <UsersRound className="h-3.5 w-3.5 text-slate-500" />}
                    <span className="text-[11px] font-semibold text-slate-800">
                      {voice?.displayName || safeSpeakerDisplayName(turn.speakerDisplayName)}
                    </span>
                    {voice?.roleSource === 'automatico' ? (
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">
                        Automático
                      </span>
                    ) : null}
                    <span className={cn(
                      'rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                      usage === 'uso_clinico'
                        ? 'bg-emerald-50 text-emerald-700'
                        : usage === 'citacao_atribuida'
                          ? 'bg-blue-100 text-blue-800'
                          : usage === 'revisao_obrigatoria'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-slate-200 text-slate-700'
                    )}>
                      {usageLabel}
                    </span>
                    {turn.start != null ? <span className="ml-auto text-[9px] tabular-nums text-slate-400">{timeLabel(turn.start)}</span> : null}
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-700">{turn.text}</p>
                  {usage === 'citacao_atribuida' ? (
                    <p className="mt-1.5 text-[10px] leading-relaxed text-blue-800">
                      Pode ser citada ou sustentar uma sugestão revisada, sem preencher o PEP automaticamente.
                    </p>
                  ) : usage === 'revisao_obrigatoria' ? (
                    <p className="mt-1.5 text-[10px] leading-relaxed text-amber-800">
                      Pode originar sugestão, sempre com confirmação profissional.
                    </p>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : runtime.conversation.segments.length ? (
          <div className="space-y-2">
            {runtime.conversation.segments.map((segment) => {
              const voice = segment.speakerLabel
                ? voicesByLabel.get(segment.speakerLabel)
                : undefined
              return (
                <article key={segment.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <MessageSquareText className="h-3 w-3" />
                    <strong className="text-slate-700">
                      {voice?.displayName || safeSpeakerDisplayName(
                        segment.speakerDisplayName,
                        segment.speakerLabel ? 'identificada' : 'nao_identificada'
                      )}
                    </strong>
                    <span>· trecho {segment.sequence}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-700">{segment.text}</p>
                </article>
              )
            })}
          </div>
        ) : runtime.conversation.transcript ? (
          <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-700">
            {runtime.conversation.transcript}
          </p>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-500">
            Nenhuma fala registrada nesta consulta.
          </p>
        )}
      </section>
    </div>
  )
}
