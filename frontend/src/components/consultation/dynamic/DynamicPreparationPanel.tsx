'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  Plus,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react'
import type {
  DynamicConsentType,
  DynamicConsultationRuntime,
  DynamicParticipant,
} from '@/types/forms'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/shared/utils'

export function getDynamicRecordingBlockers(runtime: DynamicConsultationRuntime) {
  const latestGlobal = new Map<string, boolean>()
  runtime.consents.forEach((consent) => {
    if (!consent.participantId && !latestGlobal.has(consent.type)) {
      latestGlobal.set(consent.type, consent.granted)
    }
  })

  const blockers: string[] = []
  if (latestGlobal.get('gravacao_audio') !== true) {
    blockers.push('consentimento para gravação de áudio')
  }
  if (latestGlobal.get('transcricao_ia') !== true) {
    blockers.push('consentimento para transcrição e IA')
  }

  runtime.participants.forEach((participant) => {
    if (!participant.active || participant.role === 'profissional') return
    const latestConsent = runtime.consents.find(
      (consent) => consent.type === 'participacao' && consent.participantId === participant.id
    )
    if (!participant.authorized || latestConsent?.granted !== true || latestConsent.revokedAt) {
      blockers.push(`participação de ${participant.name}`)
    }
  })

  return blockers
}

export function isDynamicRecordingReady(runtime: DynamicConsultationRuntime) {
  return getDynamicRecordingBlockers(runtime).length === 0
}

function consentStatus(
  runtime: DynamicConsultationRuntime,
  type: DynamicConsentType,
  participantId?: string
) {
  return runtime.consents.find(
    (consent) => consent.type === type && (consent.participantId || undefined) === participantId
  )
}

function DecisionButtons({
  value,
  busy,
  ariaLabel,
  onChange,
}: {
  value?: boolean
  busy?: boolean
  ariaLabel: string
  onChange: (granted: boolean) => void
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        disabled={busy}
        aria-pressed={value === true}
        onClick={() => onChange(true)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold disabled:opacity-50',
          value === true
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
        )}
      >
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Aceitou
      </button>
      <button
        type="button"
        disabled={busy}
        aria-pressed={value === false}
        onClick={() => onChange(false)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold disabled:opacity-50',
          value === false
            ? 'border-red-300 bg-red-50 text-red-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-red-300'
        )}
      >
        <XCircle className="h-3 w-3" aria-hidden="true" /> Recusou
      </button>
    </div>
  )
}

export function DynamicPreparationPanel({
  runtime,
  busy,
  onConsent,
  onAddParticipant,
  onUpdateParticipant,
}: {
  runtime: DynamicConsultationRuntime
  busy?: boolean
  onConsent: (type: DynamicConsentType, granted: boolean, participantId?: string) => void
  onAddParticipant: (data: { name: string; role: string }) => void
  onUpdateParticipant: (
    participantId: string,
    data: Pick<DynamicParticipant, 'active'>
  ) => void
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('acompanhante')
  const recordingConsent = consentStatus(runtime, 'gravacao_audio')
  const aiConsent = consentStatus(runtime, 'transcricao_ia')
  const recordingBlockers = getDynamicRecordingBlockers(runtime)
  const recordingReady = recordingBlockers.length === 0

  const submitParticipant = () => {
    if (!name.trim()) return
    onAddParticipant({ name: name.trim(), role })
    setName('')
  }

  return (
    <div className="space-y-4 p-4">
      <div className={cn(
        'rounded-xl border p-3',
        recordingReady
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-200 bg-amber-50'
      )} role="status">
        <div className="flex items-start gap-2">
          {recordingReady ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-700" />
          ) : (
            <CircleAlert className="mt-0.5 h-4 w-4 text-amber-700" />
          )}
          <div>
            <p className={cn('text-xs font-semibold', recordingReady ? 'text-emerald-900' : 'text-amber-900')}>
              {recordingReady ? 'Gravação liberada' : 'Gravação bloqueada'}
            </p>
            <p className={cn('mt-1 text-[11px]', recordingReady ? 'text-emerald-700' : 'text-amber-800')}>
              {recordingReady
                ? 'Consentimentos e participantes estão registrados.'
                : 'A consulta pode ser preenchida manualmente, mas nenhum áudio será capturado.'}
            </p>
            {!recordingReady ? (
              <ul className="mt-2 space-y-1 text-[11px] text-amber-900" aria-label="Pendências para liberar a gravação">
                {recordingBlockers.map((blocker) => (
                  <li key={blocker} className="flex items-start gap-1.5">
                    <span aria-hidden="true">•</span>
                    <span className="first-letter:uppercase">{blocker}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary-600" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Consentimentos</h3>
        </div>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800">Gravação de áudio</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Finalidade e armazenamento explicados.</p>
            </div>
            <DecisionButtons
              value={recordingConsent?.granted}
              busy={busy}
              ariaLabel="Decisão sobre o consentimento para gravação de áudio"
              onChange={(value) => onConsent('gravacao_audio', value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800">Transcrição e IA</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Uso assistivo com revisão profissional.</p>
            </div>
            <DecisionButtons
              value={aiConsent?.granted}
              busy={busy}
              ariaLabel="Decisão sobre o consentimento para transcrição e assistência por IA"
              onChange={(value) => onConsent('transcricao_ia', value)}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Pessoas presentes</h3>
          </div>
          <span className="text-[10px] text-slate-400">
            {runtime.participants.filter((item) => item.active && item.role !== 'profissional').length} presentes
          </span>
        </div>
        <div className="space-y-2">
          {runtime.participants.filter(
            (participant) => participant.active && participant.role !== 'profissional'
          ).map((participant) => {
            const coreParticipant = participant.role === 'paciente'
            const participationConsent = consentStatus(runtime, 'participacao', participant.id)
            return (
              <div key={participant.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">{participant.name}</p>
                    <p className="text-[10px] capitalize text-slate-500">{participant.role.replaceAll('_', ' ')}</p>
                  </div>
                  <DecisionButtons
                    value={participationConsent?.granted}
                    busy={busy}
                    ariaLabel={`Decisão sobre a participação de ${participant.name}`}
                    onChange={(value) => onConsent('participacao', value, participant.id)}
                  />
                </div>
                {!coreParticipant ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onUpdateParticipant(participant.id, { active: !participant.active })}
                    className="mt-2 text-[10px] font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline disabled:opacity-50"
                  >
                    Remover desta consulta
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>

        <details className="group mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Adicionar acompanhante
            </span>
          </summary>
          <div className="grid gap-2 border-t border-slate-200 p-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome"
              className="form-input py-1.5 text-xs"
            />
            <select value={role} onChange={(event) => setRole(event.target.value)} className="form-input py-1.5 text-xs">
              <option value="acompanhante">Acompanhante</option>
              <option value="responsavel">Responsável</option>
              <option value="familiar">Familiar</option>
              <option value="interprete">Intérprete</option>
              <option value="outro">Outro</option>
            </select>
            <Button size="sm" onClick={submitParticipant} disabled={!name.trim() || busy}>
              <Plus className="h-3.5 w-3.5" /> Adicionar sem autorizar
            </Button>
          </div>
        </details>
      </section>

    </div>
  )
}
